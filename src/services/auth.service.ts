import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { AppError, isDuplicateKeyError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { EMAIL_RE, normalizeDigits, normalizePhone } from "../utils/normalize.js";
import { comparePassword, DUMMY_PASSWORD_HASH, hashPassword } from "../utils/security.js";
import { signAccessToken, TOKEN_TTL } from "../utils/token.js";
import { discardOtp, issueOtp, verifyAndConsumeOtp } from "./otp.service.js";
import { sendTelegramCode, TelegramApiError } from "./telegram.service.js";
import { botLabel, resolveTelegramChat } from "./telegramChat.service.js";

type UserLike = {
  _id: unknown;
  name: string;
  email: string;
  phone: string;
  role: string;
  telegramUsername?: string | null;
  isPhoneVerified: boolean;
  isTelegramVerified: boolean;
  createdAt?: Date;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  telegramUsername: string | null;
  isPhoneVerified: boolean;
  isTelegramVerified: boolean;
  createdAt: Date | null;
};

/** فقط فیلدهای امن برای ارسال به مرورگر (بدون هش رمز و chat id). */
export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    telegramUsername: user.telegramUsername ?? null,
    isPhoneVerified: user.isPhoneVerified,
    isTelegramVerified: user.isTelegramVerified,
    createdAt: user.createdAt ?? null,
  };
}

/** کد را به تلگرام می‌فرستد؛ اگر نشد، کد ذخیره‌شده را پاک می‌کند و خطای مناسب می‌دهد. */
async function deliverCode(otpId: string, chatId: string, code: string): Promise<void> {
  try {
    await sendTelegramCode(chatId, code, env.OTP_EXPIRES_MINUTES);
  } catch (error) {
    await discardOtp(otpId);

    if (error instanceof TelegramApiError) {
      const status = error.errorCode ?? error.status;
      if (status === 400 || status === 403) {
        throw new AppError(
          422,
          "TELEGRAM_UNREACHABLE",
          `ربات نتونست به این چت پیام بفرسته. اول ${await botLabel()} رو توی تلگرام Start کن (اگه بلاکش کردی، آنبلاکش کن).`,
        );
      }
    }

    logger.error(
      { reason: error instanceof Error ? error.message : "unknown" },
      "Telegram delivery failed",
    );
    throw new AppError(
      502,
      "TELEGRAM_FAILED",
      "ارسال کد به تلگرام انجام نشد. چند لحظه‌ی دیگه دوباره امتحان کن.",
    );
  }
}

/* ============================ ثبت‌نام ============================ */

export async function requestRegistrationCode(input: {
  chat: string;
  phone: string;
  email?: string;
}): Promise<{ resendAfter: number; expiresIn: number }> {
  if (await User.exists({ phone: input.phone })) {
    throw new AppError(409, "PHONE_TAKEN", "این شماره قبلاً ثبت‌نام کرده. وارد شو.");
  }

  if (input.email && (await User.exists({ email: input.email }))) {
    throw new AppError(409, "EMAIL_TAKEN", "این ایمیل قبلاً ثبت‌نام کرده. وارد شو.");
  }

  const chat = await resolveTelegramChat(input.chat);

  if (await User.exists({ telegramChatId: chat.chatId })) {
    throw new AppError(
      409,
      "CHAT_TAKEN",
      "این حساب تلگرام قبلاً به یک حساب دیگه وصل شده.",
    );
  }

  const { id, code } = await issueOtp({
    phone: input.phone,
    telegramChatId: chat.chatId,
    purpose: "register",
  });

  await deliverCode(id, chat.chatId, code);

  return { resendAfter: env.OTP_RESEND_SECONDS, expiresIn: env.OTP_EXPIRES_MINUTES * 60 };
}

export async function completeRegistration(input: {
  chat: string;
  phone: string;
  code: string;
  name: string;
  email: string;
  pass: string;
}): Promise<{ token: string; user: PublicUser }> {
  // قبل از مصرف کد، تکراری نبودن را چک می‌کنیم تا کد الکی سوخت نشود.
  if (await User.exists({ phone: input.phone })) {
    throw new AppError(409, "PHONE_TAKEN", "این شماره قبلاً ثبت‌نام کرده. وارد شو.");
  }
  if (await User.exists({ email: input.email })) {
    throw new AppError(409, "EMAIL_TAKEN", "این ایمیل قبلاً ثبت‌نام کرده. وارد شو.");
  }

  const chat = await resolveTelegramChat(input.chat);

  await verifyAndConsumeOtp({
    phone: input.phone,
    purpose: "register",
    code: input.code,
    telegramChatId: chat.chatId,
  });

  const passwordHash = await hashPassword(input.pass);

  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      telegramChatId: chat.chatId,
      telegramUsername: chat.username ?? undefined,
      isTelegramVerified: true,
      isPhoneVerified: false,
    });

    const token = signAccessToken(
      { id: String(user._id), role: user.role },
      TOKEN_TTL.default,
    );

    return { token, user: toPublicUser(user) };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        409,
        "ALREADY_REGISTERED",
        "با این اطلاعات قبلاً ثبت‌نام شده. وارد شو.",
      );
    }
    throw error;
  }
}

/* ============================== ورود ============================== */

async function findUserForLogin(type: "id" | "phone", rawUser: string) {
  if (type === "phone") {
    const phone = normalizePhone(rawUser);
    return phone ? User.findOne({ phone }).select("+passwordHash") : null;
  }

  const value = normalizeDigits(rawUser).trim().toLowerCase();

  if (EMAIL_RE.test(value)) {
    return User.findOne({ email: value }).select("+passwordHash");
  }

  // «نام کاربری» = آیدی تلگرام کاربر. اگر بیش از یک حساب داشت، ورود رد می‌شود.
  const handle = value.replace(/^@/, "");
  const matches = await User.find({ telegramUsername: handle })
    .select("+passwordHash")
    .limit(2);

  return matches.length === 1 ? matches[0] : null;
}

export async function loginWithPassword(input: {
  type: "id" | "phone";
  user: string;
  pass: string;
  remember?: boolean;
}): Promise<{ token: string; user: PublicUser }> {
  const found = await findUserForLogin(input.type, input.user);

  // حتی اگر کاربر وجود نداشته باشد، یک مقایسه‌ی bcrypt انجام می‌شود.
  const passwordOk = await comparePassword(
    input.pass,
    found?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!found || !passwordOk || !found.isActive) {
    throw new AppError(401, "INVALID_CREDENTIALS", "نام کاربری یا رمز اشتباه است.");
  }

  await User.updateOne({ _id: found._id }, { $set: { lastLoginAt: new Date() } });

  const token = signAccessToken(
    { id: String(found._id), role: found.role },
    input.remember ? TOKEN_TTL.remember : TOKEN_TTL.session,
  );

  return { token, user: toPublicUser(found) };
}

/* ========================= فراموشی رمز عبور ========================= */

/**
 * همیشه بدون خطا برمی‌گردد (چه کاربر وجود داشته باشد چه نه)
 * تا کسی نتواند از روی پاسخ بفهمد کدام شماره‌ها ثبت‌نام کرده‌اند.
 */
export async function requestPasswordResetCode(phone: string): Promise<void> {
  const user = await User.findOne({ phone }).select("telegramChatId isActive");

  if (!user || !user.isActive || !user.telegramChatId) return;

  try {
    const { id, code } = await issueOtp({
      phone,
      telegramChatId: user.telegramChatId,
      purpose: "reset_password",
    });
    await deliverCode(id, user.telegramChatId, code);
  } catch (error) {
    if (error instanceof AppError) {
      logger.info({ code: error.code }, "Password reset code was not sent");
      return;
    }
    throw error;
  }
}

export async function resetPassword(input: {
  phone: string;
  code: string;
  pass: string;
}): Promise<void> {
  const user = await User.findOne({ phone: input.phone }).select(
    "telegramChatId isActive",
  );

  if (!user || !user.isActive || !user.telegramChatId) {
    throw new AppError(
      400,
      "OTP_NOT_FOUND",
      "کدی برای این شماره فعال نیست یا منقضی شده. کد جدید بگیر.",
    );
  }

  await verifyAndConsumeOtp({
    phone: input.phone,
    purpose: "reset_password",
    code: input.code,
    telegramChatId: user.telegramChatId,
  });

  const passwordHash = await hashPassword(input.pass);

  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash, passwordChangedAt: new Date() } },
  );
}
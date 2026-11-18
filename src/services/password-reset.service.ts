import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { PasswordResetChallenge } from "../models/ResetChallenge.js";
import { TelegramContact } from "../models/TelegramContact.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/errors.js";
import { EMAIL_RE, normalizeDigits, normalizePhone, parseChatInput } from "../utils/normalize.js";
import { hashPassword } from "../utils/security.js";
import { signAccessToken, TOKEN_TTL } from "../utils/token.js";
import { sendEmailCode } from "./email.service.js";
import { sendTelegramCode, TelegramApiError } from "./telegram.service.js";
import { botLabel } from "./telegramChat.service.js";
import { toPublicUser, type PublicUser } from "./auth.service.js";

// Isolate a Mongoose 9 inferred-query typing limitation while retaining the schema/model at runtime.
const ResetChallenge: any = PasswordResetChallenge;

type Channel = "email" | "telegram";
type Account = {
  _id: unknown; email: string; phone: string; role: string; name: string;
  isActive: boolean; isEmailVerified?: boolean; isTelegramVerified?: boolean;
  telegramChatId?: string; telegramUsername?: string;
};

const MAX_ATTEMPTS = 5;
const RESET_TOKEN_MINUTES = 10;
const GENERIC_DESTINATION = "نشانی ثبت‌شده";

function codeHash(userId: string, channel: Channel, code: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update("password-reset:" + userId + ":" + channel + ":" + code)
    .digest("hex");
}
function resetHash(token: string): string {
  return createHmac("sha256", env.JWT_SECRET).update("password-reset-token:" + token).digest("hex");
}
function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
function publicAccount(user: Account): PublicUser {
  return toPublicUser(user);
}

/** Resolves only an existing account identifier; raw input is never used as a delivery address. */
async function findAccount(rawIdentifier: string): Promise<Account | null> {
  const value = normalizeDigits(rawIdentifier).trim();
  if (!value || value.length > 254) return null;

  if (EMAIL_RE.test(value)) {
    return await User.findOne({ email: value.toLowerCase() })
      .select("name email phone role isActive isEmailVerified isTelegramVerified telegramChatId telegramUsername schoolName officialSchoolName grade fieldOfStudy createdAt") as unknown as Account | null;
  }

  const phone = normalizePhone(value);
  if (phone) {
    return await User.findOne({ phone })
      .select("name email phone role isActive isEmailVerified isTelegramVerified telegramChatId telegramUsername schoolName officialSchoolName grade fieldOfStudy createdAt") as unknown as Account | null;
  }

  const parsed = parseChatInput(value);
  if (!parsed) return null;

  let chatId: string;
  if (parsed.kind === "id") {
    chatId = parsed.chatId;
  } else {
    const directMatch = await User.findOne({ telegramUsername: parsed.username })
      .select("name email phone role isActive isEmailVerified isTelegramVerified telegramChatId telegramUsername schoolName officialSchoolName grade fieldOfStudy createdAt");
    if (directMatch) return directMatch as unknown as Account;
    const contact = await TelegramContact.findOne({ username: parsed.username })
      .sort({ lastSeenAt: -1 }).select("chatId").lean();
    if (!contact) return null;
    chatId = contact.chatId;
  }

  return await User.findOne({
    $or: [{ telegramChatId: chatId }, ...(parsed.kind === "username" ? [{ telegramUsername: parsed.username }] : [])],
  }).select("name email phone role isActive isEmailVerified isTelegramVerified telegramChatId telegramUsername schoolName officialSchoolName grade fieldOfStudy createdAt") as unknown as Account | null;
}

async function deliver(channel: Channel, user: Account, code: string): Promise<void> {
  if (channel === "email") {
    if (!user.email || user.isEmailVerified !== true) return;
    await sendEmailCode(user.email, code, env.OTP_EXPIRES_MINUTES);
    return;
  }
  if (!user.telegramChatId || user.isTelegramVerified !== true) return;
  try {
    await sendTelegramCode(user.telegramChatId, code, env.OTP_EXPIRES_MINUTES);
  } catch (error) {
    if (error instanceof TelegramApiError) {
      const status = error.errorCode ?? error.status;
      if (status === 400 || status === 403) {
        throw new AppError(422, "TELEGRAM_UNREACHABLE",
          `ربات نتونست به تلگرام متصل به حساب پیام بده. اول ${await botLabel()} رو Start کن.`);
      }
    }
    throw new AppError(502, "TELEGRAM_FAILED", "ارسال کد به تلگرام انجام نشد. کمی بعد دوباره امتحان کن.");
  }
}

export async function requestPasswordReset(input: {
  identifier: string; channel: Channel;
}): Promise<{ resendAfter: number; expiresIn: number; destination: string }> {
  const user = await findAccount(input.identifier);
  // پاسخ عمومی، حتی اگر شناسه وجود نداشته باشد یا کانال انتخابی تأیید نشده باشد.
  if (!user || !user.isActive ||
      (input.channel === "email" && user.isEmailVerified !== true) ||
      (input.channel === "telegram" && (!user.telegramChatId || user.isTelegramVerified !== true))) {
    return {
      resendAfter: env.OTP_RESEND_SECONDS,
      expiresIn: env.OTP_EXPIRES_MINUTES * 60,
      destination: GENERIC_DESTINATION,
    };
  }

  const now = new Date();
  const previous = await ResetChallenge.findOne({
    userId: user._id, channel: input.channel, consumedAt: null,
  }).sort({ issuedAt: -1 }).select("issuedAt").lean();

  if (previous) {
    const elapsed = Math.floor((now.getTime() - previous.issuedAt.getTime()) / 1000);
    if (elapsed < env.OTP_RESEND_SECONDS) {
      const retryAfter = env.OTP_RESEND_SECONDS - elapsed;
      throw new AppError(429, "OTP_COOLDOWN", `بعد از ${retryAfter} ثانیه می‌تونی دوباره کد بگیری.`, { retryAfter });
    }
  }

  await ResetChallenge.updateMany(
    { userId: user._id, channel: input.channel, consumedAt: null },
    { $set: { consumedAt: now } },
  );

  const code = String(randomInt(100_000, 1_000_000));
  const challenge = await ResetChallenge.create({
    userId: user._id,
    channel: input.channel,
    codeHash: codeHash(String(user._id), input.channel, code),
    issuedAt: now,
    codeExpiresAt: new Date(now.getTime() + env.OTP_EXPIRES_MINUTES * 60_000),
    cleanupAt: new Date(now.getTime() + 20 * 60_000),
  });

  try {
    await deliver(input.channel, user, code);
  } catch (error) {
    await ResetChallenge.deleteOne({ _id: challenge._id });
    throw error;
  }

  return {
    resendAfter: env.OTP_RESEND_SECONDS,
    expiresIn: env.OTP_EXPIRES_MINUTES * 60,
    destination: GENERIC_DESTINATION,
  };
}

export async function verifyPasswordResetCode(input: {
  identifier: string; channel: Channel; code: string;
}): Promise<{ resetToken: string; token: string; user: PublicUser }> {
  const user = await findAccount(input.identifier);
  if (!user || !user.isActive) {
    throw new AppError(400, "INVALID_CODE", "کد اشتباه است یا منقضی شده. دوباره امتحان کن.");
  }

  const now = new Date();
  const candidate = await ResetChallenge.findOne({
    userId: user._id, channel: input.channel, consumedAt: null,
    verifiedAt: null, codeExpiresAt: { $gt: now },
  }).sort({ issuedAt: -1 }).select("+codeHash attempts");

  if (!candidate) {
    throw new AppError(400, "OTP_NOT_FOUND", "کدی برای این حساب فعال نیست یا منقضی شده. کد جدید بگیر.");
  }

  const attempt = await ResetChallenge.findOneAndUpdate(
    { _id: candidate._id, consumedAt: null, verifiedAt: null, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true },
  ).select("+codeHash attempts");

  if (!attempt) {
    throw new AppError(429, "OTP_ATTEMPTS_EXCEEDED", "تعداد تلاش‌های اشتباه زیاد بود. کد جدید بگیر.");
  }

  if (!safeEqualHex(attempt.codeHash, codeHash(String(user._id), input.channel, input.code))) {
    throw new AppError(400, "INVALID_CODE", "کد اشتباه است. دوباره امتحان کن.", {
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempt.attempts),
    });
  }

  const resetToken = randomBytes(32).toString("base64url");
  const updated = await ResetChallenge.updateOne(
    { _id: attempt._id, verifiedAt: null, consumedAt: null },
    { $set: {
      verifiedAt: now,
      resetTokenHash: resetHash(resetToken),
      resetTokenExpiresAt: new Date(now.getTime() + RESET_TOKEN_MINUTES * 60_000),
    } },
  );
  if (updated.modifiedCount !== 1) {
    throw new AppError(400, "OTP_ALREADY_USED", "این کد قبلاً استفاده شده. کد جدید بگیر.");
  }

  const token = signAccessToken({ id: String(user._id), role: user.role }, TOKEN_TTL.session);
  return { resetToken, token, user: publicAccount(user) };
}

export async function completePasswordReset(input: {
  identifier: string; channel: Channel; resetToken: string; newPassword: string;
}): Promise<{ token: string; user: PublicUser }> {
  const user = await findAccount(input.identifier);
  if (!user || !user.isActive) {
    throw new AppError(400, "RESET_SESSION_INVALID", "نشست بازیابی معتبر نیست. دوباره کد بگیر.");
  }

  const now = new Date();
  const challenge = await ResetChallenge.findOne({
    userId: user._id,
    channel: input.channel,
    verifiedAt: { $ne: null },
    resetTokenExpiresAt: { $gt: now },
    consumedAt: null,
  }).sort({ issuedAt: -1 }).select("+resetTokenHash");

  if (!challenge?.resetTokenHash || !safeEqualHex(challenge.resetTokenHash, resetHash(input.resetToken))) {
    throw new AppError(400, "RESET_SESSION_INVALID", "نشست بازیابی معتبر نیست یا منقضی شده. دوباره کد بگیر.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  const consumed = await ResetChallenge.updateOne(
    { _id: challenge._id, consumedAt: null, resetTokenHash: challenge.resetTokenHash, resetTokenExpiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
  );
  if (consumed.modifiedCount !== 1) {
    throw new AppError(400, "RESET_SESSION_INVALID", "این لینک بازیابی قبلاً استفاده شده است.");
  }

  await User.updateOne(
    { _id: user._id, isActive: true },
    { $set: { passwordHash, passwordChangedAt: new Date() } },
  );
  const freshUser = await User.findById(user._id);
  if (!freshUser) throw new AppError(404, "USER_NOT_FOUND", "حساب کاربری پیدا نشد.");

  const token = signAccessToken({ id: String(freshUser._id), role: freshUser.role }, TOKEN_TTL.session);
  return { token, user: toPublicUser(freshUser) };
}

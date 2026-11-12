import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { Otp } from "../models/Otp.js";
import { AppError } from "../utils/errors.js";

export type OtpPurpose = "register" | "reset_password";

/** سقف تعداد کد برای یک چت تلگرام در ساعت؛ جلوی اسپم شدن قربانی را می‌گیرد. */
const MAX_CODES_PER_CHAT_PER_HOUR = 6;

function hashCode(purpose: OtpPurpose, phone: string, code: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update(`otp:${purpose}:${phone}:${code}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** کد شش‌رقمی امن (CSPRNG). */
export function generateCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

/**
 * یک کد جدید می‌سازد و هش آن را ذخیره می‌کند. کدهای قبلیِ همین شماره باطل می‌شوند.
 * ارسال کد به تلگرام کار صدا زننده است؛ اگر ارسال شکست خورد discardOtp را صدا بزن.
 */
export async function issueOtp(params: {
  phone: string;
  telegramChatId: string;
  purpose: OtpPurpose;
}): Promise<{ id: string; code: string }> {
  const { phone, telegramChatId, purpose } = params;
  const now = new Date();

  const last = await Otp.findOne({ phone, purpose })
    .sort({ issuedAt: -1 })
    .select("issuedAt")
    .lean();

  if (last) {
    const elapsed = (now.getTime() - last.issuedAt.getTime()) / 1000;
    if (elapsed < env.OTP_RESEND_SECONDS) {
      const retryAfter = Math.ceil(env.OTP_RESEND_SECONDS - elapsed);
      throw new AppError(
        429,
        "OTP_COOLDOWN",
        `بعد از ${retryAfter} ثانیه می‌تونی دوباره کد بگیری.`,
        { retryAfter },
      );
    }
  }

  const sentLastHour = await Otp.countDocuments({
    telegramChatId,
    issuedAt: { $gt: new Date(now.getTime() - 60 * 60 * 1000) },
  });

  if (sentLastHour >= MAX_CODES_PER_CHAT_PER_HOUR) {
    throw new AppError(
      429,
      "OTP_CHAT_LIMIT",
      "برای این حساب تلگرام کدهای زیادی درخواست شده. بعداً دوباره امتحان کن.",
      { retryAfter: 3600 },
    );
  }

  // فقط آخرین کد معتبر است.
  await Otp.updateMany({ phone, purpose, consumedAt: null }, { $set: { consumedAt: now } });

  const code = generateCode();
  const doc = await Otp.create({
    phone,
    telegramChatId,
    purpose,
    codeHash: hashCode(purpose, phone, code),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + env.OTP_EXPIRES_MINUTES * 60_000),
  });

  return { id: String(doc._id), code };
}

/** وقتی ارسال به تلگرام شکست خورد، کد را پاک می‌کنیم تا فاصله‌ی دوباره‌گرفتن هم صفر شود. */
export async function discardOtp(id: string): Promise<void> {
  await Otp.deleteOne({ _id: id });
}

/**
 * کد واردشده را بررسی می‌کند و در صورت درست بودن، آن را «مصرف‌شده» می‌کند (یک‌بار مصرف).
 * هر بررسی یک تلاش حساب می‌شود؛ بعد از maxAttempts تلاش اشتباه کد از کار می‌افتد.
 */
export async function verifyAndConsumeOtp(params: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
  telegramChatId: string;
}): Promise<void> {
  const { phone, purpose, code, telegramChatId } = params;
  const now = new Date();

  const candidate = await Otp.findOne({
    phone,
    purpose,
    consumedAt: null,
    expiresAt: { $gt: now },
  })
    .sort({ issuedAt: -1 })
    .select("telegramChatId maxAttempts");

  if (!candidate) {
    throw new AppError(
      400,
      "OTP_NOT_FOUND",
      "کدی برای این شماره فعال نیست یا منقضی شده. کد جدید بگیر.",
    );
  }

  // کد باید همان چتی را داشته باشد که برایش صادر شده است.
  if (candidate.telegramChatId !== telegramChatId) {
    throw new AppError(400, "INVALID_CODE", "کد اشتباه است. دوباره امتحان کن.");
  }

  // شمارش تلاش به‌صورت اتمیک؛ درخواست‌های هم‌زمان نمی‌توانند از سقف رد شوند.
  const attempt = await Otp.findOneAndUpdate(
    { _id: candidate._id, consumedAt: null, attempts: { $lt: candidate.maxAttempts } },
    { $inc: { attempts: 1 } },
    { new: true },
  ).select("+codeHash attempts maxAttempts");

  if (!attempt) {
    throw new AppError(
      429,
      "OTP_ATTEMPTS_EXCEEDED",
      "تعداد تلاش‌های اشتباه زیاد بود. کد جدید بگیر.",
    );
  }

  if (!safeEqualHex(attempt.codeHash, hashCode(purpose, phone, code))) {
    const attemptsLeft = Math.max(0, attempt.maxAttempts - attempt.attempts);
    throw new AppError(400, "INVALID_CODE", "کد اشتباه است. دوباره امتحان کن.", {
      attemptsLeft,
    });
  }

  const consumed = await Otp.updateOne(
    { _id: candidate._id, consumedAt: null },
    { $set: { consumedAt: now } },
  );

  if (consumed.modifiedCount !== 1) {
    throw new AppError(
      400,
      "OTP_NOT_FOUND",
      "این کد قبلاً استفاده شده. کد جدید بگیر.",
    );
  }
}
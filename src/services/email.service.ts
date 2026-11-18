import { AppError } from "../utils/errors.js";

/**
 * Email OTP delivery is intentionally centralized on Railway.
 * The frontend routes email registration requests to Railway; this guard prevents
 * accidental delivery from Render if a client bypasses the shared API router.
 */
export async function sendEmailCode(_to: string, _code: string, _expiresMinutes: number): Promise<void> {
  throw new AppError(
    503,
    "EMAIL_DELIVERY_ROUTED_TO_RAILWAY",
    "ارسال کد تأیید ایمیل فقط از سرویس اصلی Railway انجام می‌شود.",
  );
}

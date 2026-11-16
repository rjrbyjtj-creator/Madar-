import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
export async function sendEmailCode(to: string, code: string, expiresMinutes: number): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "ارسال ایمیل هنوز در تنظیمات سرور فعال نشده است.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM, to: [to], subject: "کد تأیید حساب مدار",
      html: `<div dir="rtl" style="font-family:Tahoma,Arial;background:#f5f6f8;padding:32px;color:#17233f"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e5e8ef;border-radius:16px;padding:30px"><h2 style="color:#14264f">تأیید حساب مدار</h2><p>برای تکمیل ثبت‌نام، کد زیر را در وب‌سایت مدار وارد کنید:</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#b8892d;padding:18px 0" dir="ltr">${code}</div><p>این کد تا ${expiresMinutes} دقیقه معتبر است.</p><small>اگر شما این درخواست را ثبت نکرده‌اید، این ایمیل را نادیده بگیرید.</small></div></div>`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Resend delivery failed:", response.status, detail.slice(0, 500));
    throw new AppError(502, "EMAIL_DELIVERY_FAILED", "ارسال ایمیل انجام نشد. تنظیمات فرستنده را بررسی کن.");
  }
}

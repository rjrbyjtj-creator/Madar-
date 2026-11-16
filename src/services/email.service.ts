import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

export async function sendEmailCode(to: string, code: string, expiresMinutes: number): Promise<void> {
  if (!env.SMTP_USER || !env.SMTP_APP_PASSWORD) {
    throw new AppError(503, "EMAIL_NOT_CONFIGURED", "ارسال ایمیل هنوز در تنظیمات سرور فعال نشده است.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_APP_PASSWORD.replace(/\s+/g, ""),
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  try {
    await transporter.sendMail({
      from: { name: "مدار", address: env.SMTP_USER },
      to,
      subject: "کد تأیید حساب مدار",
      html: `<div dir="rtl" style="font-family:Tahoma,Arial;background:#f5f6f8;padding:32px;color:#17233f"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e5e8ef;border-radius:16px;padding:30px"><h2 style="color:#14264f">تأیید حساب مدار</h2><p>برای تکمیل ثبت‌نام، کد زیر را در وب‌سایت مدار وارد کنید:</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#b8892d;padding:18px 0" dir="ltr">${code}</div><p>این کد تا ${expiresMinutes} دقیقه معتبر است.</p><small>اگر شما این درخواست را ثبت نکرده‌اید، این ایمیل را نادیده بگیرید.</small></div></div>`,
    });
  } catch (error) {
    console.error("Gmail SMTP delivery failed:", error instanceof Error ? error.message : error);
    throw new AppError(502, "EMAIL_DELIVERY_FAILED", "ارسال ایمیل انجام نشد. تنظیمات Gmail را بررسی کن.");
  } finally {
    transporter.close();
  }
}

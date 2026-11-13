import type { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";

function limiter(options: { windowMinutes: number; limit: number; skipSuccessful?: boolean }) {
  return rateLimit({
    windowMs: options.windowMinutes * 60 * 1000,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessful ?? false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        ok: false,
        code: "RATE_LIMITED",
        message: "درخواست‌های زیادی فرستادی. چند دقیقه‌ی دیگه دوباره امتحان کن.",
      });
    },
  });
}

/** سقف کلی برای همه‌ی مسیرهای API (به‌ازای هر IP). */
export const apiLimiter = limiter({ windowMinutes: 15, limit: 300 });

/** درخواست کد (ثبت‌نام / فراموشی رمز). */
export const sendCodeLimiter = limiter({ windowMinutes: 10, limit: 10 });

/** بررسی کد و تغییر رمز. */
export const verifyLimiter = limiter({ windowMinutes: 10, limit: 15 });

/** ورود؛ فقط تلاش‌های ناموفق شمرده می‌شوند. */
export const loginLimiter = limiter({ windowMinutes: 15, limit: 10, skipSuccessful: true });

/** چت هوش مصنوعی: 20 درخواست در هر 10 دقیقه برای هر IP. */
export const aiChatLimiter = limiter({ windowMinutes: 10, limit: 20 });

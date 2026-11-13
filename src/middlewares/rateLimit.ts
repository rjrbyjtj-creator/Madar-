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

export const apiLimiter = limiter({ windowMinutes: 15, limit: 300 });
export const sendCodeLimiter = limiter({ windowMinutes: 10, limit: 10 });
export const verifyLimiter = limiter({ windowMinutes: 10, limit: 15 });
export const loginLimiter = limiter({ windowMinutes: 15, limit: 10, skipSuccessful: true });
export const aiChatLimiter = limiter({ windowMinutes: 10, limit: 20 });
export const aiTtsLimiter = limiter({ windowMinutes: 10, limit: 30 });

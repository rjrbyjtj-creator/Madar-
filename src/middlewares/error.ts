import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ ok: false, code: "NOT_FOUND", message: "آدرس پیدا نشد." });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (error instanceof AppError) {
    const retryAfter = error.extra?.retryAfter;
    if (typeof retryAfter === "number") {
      res.setHeader("Retry-After", String(retryAfter));
    }

    res.status(error.status).json({
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.extra ?? {}),
    });
    return;
  }

  const type = (error as { type?: unknown } | null)?.type;

  if (type === "entity.parse.failed") {
    res.status(400).json({ ok: false, code: "INVALID_JSON", message: "بدنه‌ی درخواست معتبر نیست." });
    return;
  }

  if (type === "entity.too.large") {
    res.status(413).json({ ok: false, code: "PAYLOAD_TOO_LARGE", message: "حجم درخواست زیاد است." });
    return;
  }

  logger.error({ err: error }, "Unhandled error");

  res.status(500).json({
    ok: false,
    code: "INTERNAL_ERROR",
    message: "مشکلی پیش اومد. چند لحظه‌ی دیگه دوباره امتحان کن.",
  });
}
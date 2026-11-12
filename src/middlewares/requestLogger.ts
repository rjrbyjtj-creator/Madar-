import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";

/** فقط متد، مسیر (بدون query)، وضعیت و زمان لاگ می‌شود؛ هرگز بدنه یا هدرها. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info(
      {
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Math.round(ms),
      },
      "request",
    );
  });

  next();
}
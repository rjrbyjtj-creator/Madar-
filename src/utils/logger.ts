import { pino } from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.isProduction ? "info" : "debug",
  // هرگز رمز، کد تأیید یا توکن در لاگ نمی‌آید.
  redact: {
    paths: [
      "req.headers.authorization",
      "*.pass",
      "*.password",
      "*.code",
      "*.token",
      "*.codeHash",
      "*.passwordHash",
    ],
    censor: "[redacted]",
  },
});
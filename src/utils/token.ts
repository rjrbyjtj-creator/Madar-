import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const DAY = 60 * 60 * 24;

/** مدت اعتبار توکن (ثانیه) */
export const TOKEN_TTL = {
  session: DAY, // ورود بدون «مرا به خاطر بسپار»
  default: 7 * DAY, // بعد از ثبت‌نام
  remember: 30 * DAY, // ورود با «مرا به خاطر بسپار»
} as const;

export function signAccessToken(
  user: { id: string; role: string },
  ttlSeconds: number,
): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: ttlSeconds,
    algorithm: "HS256",
  });
}

export type AccessTokenPayload = { userId: string; role: string; iat: number };

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }

    return {
      userId: payload.sub,
      role: String(payload.role ?? ""),
      iat: payload.iat,
    };
  } catch {
    return null;
  }
}
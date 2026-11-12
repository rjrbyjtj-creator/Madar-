import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * وقتی کاربری پیدا نشد، رمز را با این هش مقایسه می‌کنیم تا زمان پاسخ
 * فرقی نکند و نشود از روی سرعت پاسخ فهمید چنین کاربری وجود دارد یا نه.
 */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "not-a-real-password",
  env.BCRYPT_ROUNDS,
);
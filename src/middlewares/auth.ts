import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { AppError } from "../utils/errors.js";
import { verifyAccessToken } from "../utils/token.js";

const UNAUTHORIZED = () =>
  new AppError(401, "UNAUTHORIZED", "وارد حساب خودت شو.");

/** توکن Bearer را بررسی می‌کند و کاربر را در res.locals.user می‌گذارد. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) throw UNAUTHORIZED();

  const payload = verifyAccessToken(token);
if (!payload || !mongoose.isValidObjectId(payload.userId)) throw UNAUTHORIZED();

  const user = await User.findById(payload.userId);
  if (!user || !user.isActive) throw UNAUTHORIZED();

  // اگر بعد از صدور توکن رمز عوض شده، توکن دیگر معتبر نیست.
  if (
    user.passwordChangedAt &&
    Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat
  ) {
    throw UNAUTHORIZED();
  }

  res.locals.user = user;
  next();
}
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import {
  completeRegistration,
  loginWithPassword,
  requestPasswordResetCode,
  requestRegistrationCode,
  resetPassword,
} from "../services/auth.service.js";
import {
  parseForgotSendCode,
  parseLogin,
  parseResetPassword,
  parseSendRegisterCode,
  parseVerifyRegister,
} from "../validators/auth.validators.js";

/** POST /api/auth/register/send-code  body: { chat, phone, email? } */
export async function registerSendCode(req: Request, res: Response): Promise<void> {
  const input = parseSendRegisterCode(req.body);
  const result = await requestRegistrationCode(input);
  res.json({ ok: true, ...result });
}

/** POST /api/auth/register/verify  body: { chat, phone, code, name, email, pass } */
export async function registerVerify(req: Request, res: Response): Promise<void> {
  const input = parseVerifyRegister(req.body);
  const { token, user } = await completeRegistration(input);
  res.status(201).json({ ok: true, token, user });
}

/** POST /api/auth/login  body: { type: "id" or "phone", user, pass, remember? } */
export async function login(req: Request, res: Response): Promise<void> {
  const input = parseLogin(req.body);
  const { token, user } = await loginWithPassword(input);
  res.json({ ok: true, token, user });
}

/** POST /api/auth/forgot-password/send-code  body: { phone } */
export async function forgotSendCode(req: Request, res: Response): Promise<void> {
  const { phone } = parseForgotSendCode(req.body);
  await requestPasswordResetCode(phone);

  // پاسخ برای همه یکسان است (شماره ثبت‌شده باشد یا نباشد).
  res.json({
    ok: true,
    resendAfter: env.OTP_RESEND_SECONDS,
    expiresIn: env.OTP_EXPIRES_MINUTES * 60,
  });
}

/** POST /api/auth/forgot-password/reset  body: { phone, code, pass } */
export async function forgotReset(req: Request, res: Response): Promise<void> {
  const input = parseResetPassword(req.body);
  await resetPassword(input);
  res.json({ ok: true, message: "رمز عبور عوض شد. حالا وارد شو." });
}
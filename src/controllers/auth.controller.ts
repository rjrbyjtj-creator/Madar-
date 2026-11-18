import type { Request, Response } from "express";
import { loginWithPassword } from "../services/auth.service.js";
import { requestRegistrationCode, completeRegistration } from "../services/registration.service.js";
import {
  completePasswordReset,
  requestPasswordReset,
  verifyPasswordResetCode,
} from "../services/password-reset.service.js";
import {
  parseLogin,
  parseSendRegisterCode,
  parseVerifyRegister,
  parsePasswordResetSend,
  parsePasswordResetVerify,
  parsePasswordResetComplete,
} from "../validators/auth.validators.js";

export async function registerSendCode(req: Request, res: Response): Promise<void> {
  const input = parseSendRegisterCode(req.body);
  const result = await requestRegistrationCode(input);
  res.json({ ok: true, ...result });
}
export async function registerVerify(req: Request, res: Response): Promise<void> {
  const input = parseVerifyRegister(req.body);
  const { token, user } = await completeRegistration(input);
  res.status(201).json({ ok: true, token, user });
}
export async function login(req: Request, res: Response): Promise<void> {
  const input = parseLogin(req.body);
  const { token, user } = await loginWithPassword(input);
  res.json({ ok: true, token, user });
}

/** POST /auth/forgot-password/send-code { identifier, channel } */
export async function forgotSendCode(req: Request, res: Response): Promise<void> {
  const input = parsePasswordResetSend(req.body);
  const result = await requestPasswordReset(input);
  res.json({ ok: true, ...result });
}
/** POST /auth/forgot-password/verify-code { identifier, channel, code } */
export async function forgotVerifyCode(req: Request, res: Response): Promise<void> {
  const input = parsePasswordResetVerify(req.body);
  const result = await verifyPasswordResetCode(input);
  res.json({ ok: true, ...result });
}
/** POST /auth/forgot-password/reset { identifier, channel, resetToken, newPassword } */
export async function forgotReset(req: Request, res: Response): Promise<void> {
  const input = parsePasswordResetComplete(req.body);
  const result = await completePasswordReset(input);
  res.json({ ok: true, ...result });
}

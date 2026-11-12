import { Router } from "express";
import {
  forgotReset,
  forgotSendCode,
  login,
  registerSendCode,
  registerVerify,
} from "../controllers/auth.controller.js";
import { loginLimiter, sendCodeLimiter, verifyLimiter } from "../middlewares/rateLimit.js";

export const authRouter = Router();

authRouter.post("/register/send-code", sendCodeLimiter, registerSendCode);
authRouter.post("/register/verify", verifyLimiter, registerVerify);
authRouter.post("/login", loginLimiter, login);
authRouter.post("/forgot-password/send-code", sendCodeLimiter, forgotSendCode);
authRouter.post("/forgot-password/reset", verifyLimiter, forgotReset);
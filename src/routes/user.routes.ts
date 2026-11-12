import { Router } from "express";
import { getMe } from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/auth.js";

export const userRouter = Router();

userRouter.get("/me", requireAuth, getMe);
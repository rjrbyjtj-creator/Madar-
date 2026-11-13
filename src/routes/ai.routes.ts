import { Router } from "express";
import { chatWithAI } from "../controllers/ai.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { aiChatLimiter } from "../middlewares/rateLimit.js";

export const aiRouter = Router();

// فقط کاربران واردشده می‌توانند از دستیار استفاده کنند.
aiRouter.post("/chat", requireAuth, aiChatLimiter, chatWithAI);

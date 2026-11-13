import { Router } from "express";
import {
  chatWithAI,
  deleteConversation,
  getConversation,
  listConversations,
  textToSpeech,
} from "../controllers/ai.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { aiChatLimiter, aiTtsLimiter } from "../middlewares/rateLimit.js";

export const aiRouter = Router();

// همه مسیرهای دستیار نیازمند ورود هستند.
aiRouter.get("/conversations", requireAuth, listConversations);
aiRouter.get("/conversations/:id", requireAuth, getConversation);
aiRouter.delete("/conversations/:id", requireAuth, deleteConversation);
aiRouter.post("/chat", requireAuth, aiChatLimiter, chatWithAI);
aiRouter.post("/tts", requireAuth, aiTtsLimiter, textToSpeech);

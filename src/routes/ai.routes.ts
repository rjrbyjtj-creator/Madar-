import { Router } from "express";
import {
  chatWithAI,
  deleteConversation,
  getConversation,
  listConversations,
} from "../controllers/ai.controller.js";
import { synthesizeSpeech } from "../controllers/speech.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { aiChatLimiter, aiSpeechLimiter } from "../middlewares/rateLimit.js";

export const aiRouter = Router();

aiRouter.get("/conversations", requireAuth, listConversations);
aiRouter.get("/conversations/:id", requireAuth, getConversation);
aiRouter.delete("/conversations/:id", requireAuth, deleteConversation);
aiRouter.post("/chat", requireAuth, aiChatLimiter, chatWithAI);
aiRouter.post("/speech", requireAuth, aiSpeechLimiter, synthesizeSpeech);

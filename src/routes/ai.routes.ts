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
aiRouter.use(requireAuth);
aiRouter.get("/conversations", listConversations);
aiRouter.get("/conversations/:id", getConversation);
aiRouter.delete("/conversations/:id", deleteConversation);
aiRouter.post("/chat", aiChatLimiter, chatWithAI);
aiRouter.post("/tts", aiTtsLimiter, textToSpeech);

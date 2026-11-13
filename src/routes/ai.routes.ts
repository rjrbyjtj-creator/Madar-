import { Router } from "express";
import {
  chatWithAI,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  toggleConversationPin,
} from "../controllers/ai.controller.js";
import { getSharedConversation, createConversationShare } from "../controllers/share.controller.js";
import { synthesizeSpeech } from "../controllers/speech.controller.js";
import { createLiveToken, saveVoiceTurn } from "../controllers/live.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { aiChatLimiter, aiSpeechLimiter, aiLiveTokenLimiter, aiVoiceTurnLimiter } from "../middlewares/rateLimit.js";

export const aiRouter = Router();

aiRouter.get("/conversations/shared/:token", getSharedConversation);
aiRouter.get("/conversations", requireAuth, listConversations);
aiRouter.get("/conversations/:id", requireAuth, getConversation);
aiRouter.delete("/conversations/:id", requireAuth, deleteConversation);
aiRouter.post("/conversations/:id/title", requireAuth, renameConversation);
aiRouter.post("/conversations/:id/pin", requireAuth, toggleConversationPin);
aiRouter.post("/conversations/:id/share", requireAuth, createConversationShare);
aiRouter.post("/chat", requireAuth, aiChatLimiter, chatWithAI);
aiRouter.post("/speech", requireAuth, aiSpeechLimiter, synthesizeSpeech);
aiRouter.post("/voice/token", requireAuth, aiLiveTokenLimiter, createLiveToken);
aiRouter.post("/voice/turn", requireAuth, aiVoiceTurnLimiter, saveVoiceTurn);

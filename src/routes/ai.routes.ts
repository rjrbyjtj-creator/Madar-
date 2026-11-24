import express, { Router } from "express";
import {
  chatWithAI,
  getAIJob,
  uploadChatDocument,
  getChatAttachment,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  toggleConversationPin,
} from "../controllers/ai.controller.js";
import { getSharedConversation, createConversationShare } from "../controllers/share.controller.js";
import { synthesizeSpeech } from "../controllers/speech.controller.js";
import { renderExamPaper } from "../controllers/exam-paper.controller.js";
import { getAIModelStatus, getCoarenaModels } from "../controllers/ai-model-status.controller.js";
import { createLiveToken, saveVoiceTurn } from "../controllers/live.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { aiChatLimiter, aiSpeechLimiter, aiLiveTokenLimiter, aiVoiceTurnLimiter } from "../middlewares/rateLimit.js";

export const aiRouter = Router();

aiRouter.get("/conversations/shared/:token", getSharedConversation);
aiRouter.get("/model-status", requireAuth, getAIModelStatus);
aiRouter.get("/coarena/models", requireAuth, getCoarenaModels);
aiRouter.get("/attachments/:id", requireAuth, getChatAttachment);
aiRouter.get("/jobs/:id", requireAuth, getAIJob);
aiRouter.get("/conversations", requireAuth, listConversations);
aiRouter.get("/conversations/:id", requireAuth, getConversation);
aiRouter.delete("/conversations/:id", requireAuth, deleteConversation);
aiRouter.post("/conversations/:id/title", requireAuth, renameConversation);
aiRouter.post("/conversations/:id/pin", requireAuth, toggleConversationPin);
aiRouter.post("/conversations/:id/share", requireAuth, createConversationShare);
aiRouter.post("/documents", requireAuth, aiChatLimiter, express.raw({ type: ["application/pdf", "image/jpeg", "image/png", "image/webp"], limit: "15mb" }), uploadChatDocument);
aiRouter.post("/chat", requireAuth, aiChatLimiter, chatWithAI);
aiRouter.post("/exams/render", requireAuth, aiChatLimiter, express.json({ limit: "256kb" }), renderExamPaper);
aiRouter.post("/speech", requireAuth, aiSpeechLimiter, synthesizeSpeech);
aiRouter.post("/voice/token", requireAuth, aiLiveTokenLimiter, createLiveToken);
aiRouter.post("/voice/turn", requireAuth, aiVoiceTurnLimiter, saveVoiceTurn);

import mongoose from "mongoose";
import { z } from "zod";
import type { Request, Response } from "express";
import { Conversation } from "../models/Conversation.js";
import { AppError } from "../utils/errors.js";
import { generateGeminiReply, generateGeminiSpeech } from "../services/gemini.service.js";

const messageSchema = z.object({ role: z.enum(["user", "model"]), content: z.string().trim().min(1).max(2500) });
const chatSchema = z.object({ conversationId: z.string().optional(), messages: z.array(messageSchema).min(1).max(12) });
const speechSchema = z.object({ text: z.string().trim().min(1).max(5000) });

function currentUserId(res: Response): mongoose.Types.ObjectId {
  const user = res.locals.user as { _id: mongoose.Types.ObjectId };
  return user._id;
}

export async function listConversations(_req: Request, res: Response): Promise<void> {
  const conversations = await Conversation.find({ userId: currentUserId(res) })
    .select("_id title updatedAt").sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ ok: true, conversations: conversations.map((item) => ({
    id: String(item._id), title: item.title, updatedAt: item.updatedAt,
  })) });
}

export async function getConversation(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
  const conversation = await Conversation.findOne({ _id: id, userId: currentUserId(res) }).lean();
  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "گفتگو پیدا نشد.");
  res.json({ ok: true, conversation: {
    id: String(conversation._id), title: conversation.title,
    messages: conversation.messages, updatedAt: conversation.updatedAt,
  } });
}

export async function deleteConversation(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
  const result = await Conversation.deleteOne({ _id: id, userId: currentUserId(res) });
  if (!result.deletedCount) throw new AppError(404, "CONVERSATION_NOT_FOUND", "گفتگو پیدا نشد.");
  res.json({ ok: true });
}

export async function chatWithAI(req: Request, res: Response): Promise<void> {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_CHAT_REQUEST", "پیام‌های ارسالی معتبر نیستند.");
  const messages = parsed.data.messages;
  const latest = messages[messages.length - 1];
  if (latest?.role !== "user") throw new AppError(400, "INVALID_CHAT_TURN", "آخرین پیام گفتگو باید پیام دانش‌آموز باشد.");

  const user = res.locals.user as { _id: mongoose.Types.ObjectId; name?: string; role?: string };
  let conversation = parsed.data.conversationId
    ? await Conversation.findOne({ _id: parsed.data.conversationId, userId: user._id })
    : null;
  if (parsed.data.conversationId && !conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "گفتگو پیدا نشد یا به این حساب تعلق ندارد.");
  }

  const reply = await generateGeminiReply(messages, { name: user.name, role: user.role });
  if (!conversation) conversation = new Conversation({
    userId: user._id, title: latest.content.slice(0, 72), messages: [],
  });
  conversation.messages.push(
    { role: "user", content: latest.content, createdAt: new Date() },
    { role: "model", content: reply, createdAt: new Date() },
  );
  await conversation.save();

  res.json({ ok: true, reply, model: "gemini", conversationId: String(conversation._id), title: conversation.title });
}

export async function textToSpeech(req: Request, res: Response): Promise<void> {
  const parsed = speechSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_SPEECH_REQUEST", "متن برای تبدیل به گفتار معتبر نیست.");
  const audio = await generateGeminiSpeech(parsed.data.text);
  res.json({ ok: true, audio, mimeType: "audio/wav" });
}

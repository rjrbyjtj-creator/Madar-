import mongoose from "mongoose";
import { z } from "zod";
import type { Request, Response } from "express";
import { Conversation } from "../models/Conversation.js";
import { AppError } from "../utils/errors.js";
import { generateGeminiReply, type GeminiMessage } from "../services/gemini.service.js";

const messageSchema = z.object({
  role: z.enum(["user", "model"]),
  content: z.string().trim().min(1).max(2500),
});

const chatSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().trim().min(1).max(2500).optional(),
  messages: z.array(messageSchema).min(1).max(12).optional(),
}).refine((value) => Boolean(value.message || value.messages?.some((item) => item.role === "user")), {
  message: "A user message is required.",
});

type AuthUser = { _id: mongoose.Types.ObjectId; name?: string; role?: string };

export async function chatWithAI(req: Request, res: Response): Promise<void> {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_CHAT_REQUEST", "پیام ارسالی معتبر نیست. متن هر پیام باید حداکثر ۲۵۰۰ نویسه باشد.");
  }

  const user = res.locals.user as AuthUser;
  const latestUserMessage = parsed.data.message ??
    [...(parsed.data.messages ?? [])].reverse().find((item) => item.role === "user")?.content;
  if (!latestUserMessage) {
    throw new AppError(400, "INVALID_CHAT_TURN", "پیام دانش‌آموز پیدا نشد.");
  }

  let conversation;
  if (parsed.data.conversationId) {
    if (!mongoose.isValidObjectId(parsed.data.conversationId)) {
      throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
    }
    conversation = await Conversation.findOne({ _id: parsed.data.conversationId, user: user._id });
    if (!conversation) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "این گفتگو پیدا نشد.");
    }
  } else {
    conversation = new Conversation({
      user: user._id,
      title: latestUserMessage.slice(0, 72),
      messages: [],
    });
  }

  const history: GeminiMessage[] = conversation.messages
    .slice(-11)
    .map((item) => ({ role: item.role as "user" | "model", content: item.content }));

  const reply = await generateGeminiReply(
    [...history, { role: "user", content: latestUserMessage }],
    { name: user.name, role: user.role },
  );

  conversation.messages.push(
    { role: "user", content: latestUserMessage, createdAt: new Date() },
    { role: "model", content: reply, createdAt: new Date() },
  );
  if (conversation.messages.length <= 2) conversation.title = latestUserMessage.slice(0, 72);
  await conversation.save();

  res.json({
    ok: true,
    reply,
    model: "gemini",
    conversationId: String(conversation._id),
    title: conversation.title,
  });
}

export async function listConversations(_req: Request, res: Response): Promise<void> {
  const user = res.locals.user as AuthUser;
  const conversations = await Conversation.find({ user: user._id })
    .select("_id title createdAt updatedAt")
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  res.json({ ok: true, conversations });
}

export async function getConversation(req: Request, res: Response): Promise<void> {
  const user = res.locals.user as AuthUser;
  const id = String(req.params.id ?? "");
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
  }
  const conversation = await Conversation.findOne({ _id: id, user: user._id }).lean();
  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "این گفتگو پیدا نشد.");

  res.json({
    ok: true,
    conversation: {
      id: String(conversation._id),
      title: conversation.title,
      messages: conversation.messages.map((item) => ({
        role: item.role,
        content: item.content,
        createdAt: item.createdAt,
      })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
  });
}

export async function deleteConversation(req: Request, res: Response): Promise<void> {
  const user = res.locals.user as AuthUser;
  const id = String(req.params.id ?? "");
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
  }
  const deleted = await Conversation.findOneAndDelete({ _id: id, user: user._id });
  if (!deleted) throw new AppError(404, "CONVERSATION_NOT_FOUND", "این گفتگو پیدا نشد.");
  res.json({ ok: true });
}

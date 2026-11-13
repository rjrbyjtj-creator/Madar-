import mongoose from "mongoose";
import { z } from "zod";
import type { Request, Response } from "express";
import { AppError } from "../utils/errors.js";
import { ChatConversation } from "../models/ChatConversation.js";
import { generateGeminiReply, type GeminiMessage } from "../services/gemini.service.js";
import { generateGeminiSpeech } from "../services/gemini-tts.service.js";

const messageSchema = z.object({
  role: z.enum(["user", "model"]),
  content: z.string().trim().min(1).max(2500),
});

const chatSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().trim().min(1).max(2500).optional(),
  messages: z.array(messageSchema).min(1).max(12).optional(),
}).refine((value) => Boolean(value.message || value.messages?.length), {
  message: "پیام گفتگو خالی است.",
});

const speechSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

function currentUserId(res: Response) {
  return (res.locals.user as { _id: mongoose.Types.ObjectId })._id;
}

export async function chatWithAI(req: Request, res: Response): Promise<void> {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_CHAT_REQUEST", "پیام ارسالی معتبر نیست یا بیش از حد طولانی است.");
  }

  const input = parsed.data;
  const owner = currentUserId(res);
  let conversation = null;
  let history: GeminiMessage[] = [];
  let userMessage = input.message?.trim() ?? "";

  if (input.conversationId) {
    if (!mongoose.isValidObjectId(input.conversationId)) {
      throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
    }
    conversation = await ChatConversation.findOne({ _id: input.conversationId, owner });
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "این گفتگو پیدا نشد.");

    if (!userMessage) {
      const last = input.messages?.[input.messages.length - 1];
      if (last?.role === "user") userMessage = last.content;
    }
    if (!userMessage) {
      throw new AppError(400, "INVALID_CHAT_TURN", "پیام جدید دانش‌آموز دریافت نشد.");
    }

    history = conversation.messages.slice(-11).map((message) => ({
      role: message.role as "user" | "model",
      content: message.content,
    }));
  } else {
    if (!input.messages?.length || input.messages[input.messages.length - 1]?.role !== "user") {
      throw new AppError(400, "INVALID_CHAT_TURN", "آخرین پیام گفتگو باید پیام دانش‌آموز باشد.");
    }
    userMessage = input.message ?? input.messages[input.messages.length - 1]!.content;
    history = input.messages.slice(-12).map((message) => ({ ...message }));
  }

  if (history[history.length - 1]?.role !== "user" || history[history.length - 1]?.content !== userMessage) {
    history.push({ role: "user", content: userMessage });
  }

  const user = res.locals.user as { name?: string; role?: string };
  const reply = await generateGeminiReply(history, { name: user.name, role: user.role });

  if (!conversation) {
    const initialMessages = history.map((message) => ({ ...message }));
    initialMessages.push({ role: "model" as const, content: reply });
    conversation = await ChatConversation.create({
      owner,
      title: userMessage.slice(0, 90) || "گفتگوی جدید",
      messages: initialMessages,
    });
  } else {
    conversation.messages.push({ role: "user", content: userMessage });
    conversation.messages.push({ role: "model", content: reply });
    await conversation.save();
  }

  res.json({
    ok: true,
    reply,
    model: "gemini",
    conversationId: conversation.id,
    title: conversation.title,
  });
}

export async function listConversations(_req: Request, res: Response): Promise<void> {
  const conversations = await ChatConversation.find({ owner: currentUserId(res) })
    .sort({ updatedAt: -1 })
    .limit(100)
    .select("title updatedAt messages")
    .lean();

  res.json({
    ok: true,
    conversations: conversations.map((item) => ({
      id: String(item._id),
      title: item.title,
      updatedAt: item.updatedAt,
      lastMessage: item.messages[item.messages.length - 1]?.content ?? "",
    })),
  });
}

export async function getConversation(req: Request, res: Response): Promise<void> {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
  }
  const conversation = await ChatConversation.findOne({
    _id: req.params.id,
    owner: currentUserId(res),
  }).lean();

  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "این گفتگو پیدا نشد.");

  res.json({
    ok: true,
    conversation: {
      id: String(conversation._id),
      title: conversation.title,
      messages: conversation.messages.map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
    },
  });
}

export async function deleteConversation(req: Request, res: Response): Promise<void> {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
  }
  const result = await ChatConversation.deleteOne({
    _id: req.params.id,
    owner: currentUserId(res),
  });
  if (!result.deletedCount) throw new AppError(404, "CONVERSATION_NOT_FOUND", "این گفتگو پیدا نشد.");
  res.json({ ok: true });
}

export async function textToSpeech(req: Request, res: Response): Promise<void> {
  const parsed = speechSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_TTS_REQUEST", "متن برای تبدیل به صدا معتبر نیست.");
  }

  const audio = await generateGeminiSpeech(parsed.data.text);
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Length", String(audio.length));
  res.setHeader("Cache-Control", "private, no-store");
  res.send(audio);
}

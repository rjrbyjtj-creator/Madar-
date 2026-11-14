import mongoose from "mongoose";
import { z } from "zod";
import type { Request, Response } from "express";
import { Conversation } from "../models/Conversation.js";
import { Plan } from "../models/Plan.js";
import { AppError } from "../utils/errors.js";
import { generateGeminiReply, type GeminiMessage } from "../services/gemini.service.js";

const messageSchema = z.object({
  role: z.enum(["user", "model"]),
  content: z.string().trim().min(1).max(2500),
});

const chatSchema = z.object({
  conversationId: z.string().nullable().optional(),
  message: z.string().trim().min(1).max(2500).optional(),
  persona: z.enum(["balanced", "friendly", "buddy", "witty"]).optional(),
  messages: z.array(messageSchema).min(1).max(12).optional(),
}).refine((value) => Boolean(value.message || value.messages?.some((item) => item.role === "user")), {
  message: "A user message is required.",
});

type AuthUser = { _id: mongoose.Types.ObjectId; name?: string; role?: string };

function isPlannerReviewRequest(message: string): boolean {
  return /(برنامه|پلن).{0,45}(من|م|امروز|این هفته|ببین|بررسی|تحلیل|نظر|چطوره|چطور)|نظر.{0,20}(برنامه|پلن)|تحلیل.{0,20}(برنامه|پلن)/i.test(message);
}

async function buildPlannerContext(userId: mongoose.Types.ObjectId): Promise<string> {
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - 14);
  const toDate = new Date();
  toDate.setUTCDate(toDate.getUTCDate() + 30);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);
  const plans = await Plan.find({ user: userId, date: { $gte: from, $lte: to } })
    .select("date tasks note")
    .sort({ date: 1 })
    .limit(45)
    .lean();

  if (!plans.length) {
    return "برنامه‌ای برای این دانش‌آموز در بازه اخیر ثبت نشده است. از او بخواه ابتدا در صفحه برنامه‌ریزی فعالیت‌هایش را ثبت و ذخیره کند.";
  }

  const compact = plans.map((day) => ({
    date: day.date,
    tasks: (day.tasks ?? []).map((task) => ({
      title: task.title,
      category: task.type,
      start: task.start,
      end: task.end,
      completed: Boolean(task.done),
    })),
    note: day.note || "",
  }));
  return "برنامه ثبت‌شده دانش‌آموز در سامانه (JSON):\n" + JSON.stringify(compact).slice(0, 12000);
}


export async function chatWithAI(req: Request, res: Response): Promise<void> {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      400,
      "INVALID_CHAT_REQUEST",
      "پیام ارسالی معتبر نیست. متن هر پیام باید حداکثر ۲۵۰۰ نویسه باشد.",
    );
  }

  const user = res.locals.user as AuthUser;
  const latestUserMessage =
    parsed.data.message ??
    [...(parsed.data.messages ?? [])].reverse().find((item) => item.role === "user")?.content;
  if (!latestUserMessage) {
    throw new AppError(400, "INVALID_CHAT_TURN", "پیام دانش‌آموز پیدا نشد.");
  }

  let conversation;
  if (parsed.data.conversationId) {
    if (!mongoose.isValidObjectId(parsed.data.conversationId)) {
      throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
    }
    conversation = await Conversation.findOne({
      _id: parsed.data.conversationId,
      user: user._id,
    }).select("_id title messages");
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

  // Compact history window — Gemini must start with a user turn.
  const recentMessages = conversation.messages.slice(-8);
  const firstUserIndex = recentMessages.findIndex((item) => item.role === "user");
  const history: GeminiMessage[] = (
    firstUserIndex >= 0 ? recentMessages.slice(firstUserIndex) : []
  ).map((item) => ({
    role: item.role as "user" | "model",
    content: item.content,
  }));

  const plannerContext =
    user.role === "student" && isPlannerReviewRequest(latestUserMessage)
      ? await buildPlannerContext(user._id)
      : undefined;

  const reply = await generateGeminiReply(
    [...history, { role: "user", content: latestUserMessage }],
    {
      name: user.name,
      role: user.role,
      persona: parsed.data.persona ?? "balanced",
      plannerContext,
    },
  );

  conversation.messages.push(
    { role: "user", content: latestUserMessage, createdAt: new Date() },
    { role: "model", content: reply, createdAt: new Date() },
  );
  if (conversation.messages.length <= 2) {
    conversation.title = latestUserMessage.slice(0, 72);
  }
  if (conversation.messages.length > 100) {
    conversation.messages.splice(0, conversation.messages.length - 100);
  }

  const conversationId = String(conversation._id);
  const title = conversation.title;

  // Send the answer immediately — do not make the user wait for MongoDB write.
  res.json({
    ok: true,
    reply,
    model: "gemini",
    conversationId,
    title,
  });

  // Persist in the background. A failed save must not break the chat UX.
  void conversation.save().catch((err: unknown) => {
    console.error(
      "[AI] conversation save failed:",
      err instanceof Error ? err.message : err,
    );
  });
}

export async function listConversations(_req: Request, res: Response): Promise<void> {
  const user = res.locals.user as AuthUser;
  const conversations = await Conversation.find({ user: user._id })
    .select("_id title isPinned createdAt updatedAt")
    .sort({ isPinned: -1, updatedAt: -1 })
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

export async function renameConversation(req: Request, res: Response): Promise<void> {
  const user = res.locals.user as AuthUser;
  const id = String(req.params.id ?? "");
  const title = z.string().trim().min(1).max(80).safeParse(req.body?.title);
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
  }
  if (!title.success) {
    throw new AppError(400, "INVALID_TITLE", "نام گفتگو باید بین ۱ تا ۸۰ نویسه باشد.");
  }
  const conversation = await Conversation.findOneAndUpdate(
    { _id: id, user: user._id },
    { $set: { title: title.data } },
    { new: true },
  )
    .select("_id title isPinned")
    .lean();
  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "این گفتگو پیدا نشد.");
  res.json({ ok: true, conversation });
}

export async function toggleConversationPin(req: Request, res: Response): Promise<void> {
  const user = res.locals.user as AuthUser;
  const id = String(req.params.id ?? "");
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
  }
  const conversation = await Conversation.findOne({ _id: id, user: user._id });
  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "این گفتگو پیدا نشد.");
  conversation.isPinned = !conversation.isPinned;
  await conversation.save();
  res.json({ ok: true, isPinned: conversation.isPinned });
}

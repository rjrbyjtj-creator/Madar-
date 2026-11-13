import { z } from "zod";
import type { Request, Response } from "express";
import { AppError } from "../utils/errors.js";
import { generateGeminiReply } from "../services/gemini.service.js";

const messageSchema = z.object({
  role: z.enum(["user", "model"]),
  content: z.string().trim().min(1).max(2500),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(12),
});

export async function chatWithAI(req: Request, res: Response): Promise<void> {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      400,
      "INVALID_CHAT_REQUEST",
      "پیام‌های ارسالی معتبر نیستند. متن هر پیام باید حداکثر ۲۵۰۰ نویسه باشد.",
    );
  }

  const messages = parsed.data.messages;
  if (messages[messages.length - 1]?.role !== "user") {
    throw new AppError(400, "INVALID_CHAT_TURN", "آخرین پیام گفتگو باید پیام دانش‌آموز باشد.");
  }

  const user = res.locals.user as { name?: string; role?: string };
  const reply = await generateGeminiReply(messages, {
    name: user.name,
    role: user.role,
  });

  res.json({
    ok: true,
    reply,
    model: "gemini",
  });
}

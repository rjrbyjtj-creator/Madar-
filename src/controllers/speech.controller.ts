import { z } from "zod";
import type { Request, Response } from "express";
import { AppError } from "../utils/errors.js";
import { generateGeminiSpeech } from "../services/gemini.service.js";

const speechSchema = z.object({
  text: z.string().trim().min(1).max(3000),
});

export async function synthesizeSpeech(req: Request, res: Response): Promise<void> {
  const parsed = speechSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_SPEECH_REQUEST", "متن برای تبدیل به صدا معتبر نیست.");
  }

  const audio = await generateGeminiSpeech(parsed.data.text);
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Length", String(audio.length));
  res.setHeader("Cache-Control", "no-store");
  res.send(audio);
}

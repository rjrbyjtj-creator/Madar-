import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../utils/errors.js";
import { renderExamPaperHtml } from "../services/exam-paper-template.service.js";

const questionSchema = z.object({
  number: z.number().int().min(1).max(100),
  text: z.string().trim().min(1).max(3000),
  score: z.number().min(0).max(100),
  section: z.string().trim().max(120).optional(),
  answerLines: z.number().int().min(1).max(8).optional(),
});

const examPaperSchema = z.object({
  examTitle: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(80),
  grade: z.string().trim().min(1).max(80),
  field: z.string().trim().max(80).optional(),
  duration: z.string().trim().min(1).max(40),
  totalScore: z.number().positive().max(100),
  examDate: z.string().trim().max(40).optional(),
  studentName: z.string().trim().max(100).optional(),
  school: z.string().trim().max(120).optional(),
  className: z.string().trim().max(60).optional(),
  teacher: z.string().trim().max(100).optional(),
  questions: z.array(questionSchema).min(1).max(60),
});

export async function renderExamPaper(req: Request, res: Response): Promise<void> {
  const parsed = examPaperSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_EXAM_PAPER", "اطلاعات آزمون معتبر نیست؛ عنوان، درس، پایه، مدت، بارم و سؤال‌ها را بررسی کن.");
  }

  let html: string;
  try {
    html = await renderExamPaperHtml(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("do not equal")) {
      throw new AppError(400, "EXAM_SCORE_MISMATCH", "جمع بارم سؤال‌ها با بارم کل آزمون برابر نیست.");
    }
    throw error;
  }

  const safeSubject = parsed.data.subject.replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 40) || "exam";
  const filename = `madar-${safeSubject}-exam.html`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="madar-exam.html"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(html);
}

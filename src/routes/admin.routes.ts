import { Router } from "express";
import { User } from "../models/User.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";
import mongoose from "mongoose";
import { z } from "zod";
import { QuestionBankItem } from "../models/QuestionBankItem.js";
import { AppError } from "../utils/errors.js";

export const adminRouter = Router();

/** GET /api/admin/stats — real counts from MongoDB; admin only. */
adminRouter.get("/stats", requireAuth, requireAdmin, async (_req, res) => {
  const [totalUsers, students, teachers, admins, activeUsers] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "teacher" }),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ isActive: true }),
  ]);

  res.json({
    ok: true,
    stats: { totalUsers, students, teachers, admins, activeUsers, schools: null, supportTickets: null },
    unavailable: {
      schools: "در نسخه فعلی بک‌اند، مدل یا مجموعه‌ای برای ثبت مدارس وجود ندارد.",
      supportTickets: "در نسخه فعلی بک‌اند، مدل یا مجموعه‌ای برای تیکت‌های پشتیبانی وجود ندارد.",
    },
    generatedAt: new Date().toISOString(),
  });
});

const questionBankSchema = z.object({
  question: z.string().trim().min(10).max(5000),
  subject: z.string().trim().min(1).max(80),
  grade: z.string().trim().max(40).default(""),
  chapter: z.string().trim().max(120).default(""),
  questionType: z.string().trim().max(60).default("ترکیبی"),
  difficulty: z.enum(["آسان", "متوسط", "سخت", "ترکیبی"]).default("متوسط"),
  source: z.string().trim().max(180).default(""),
});

/** Question bank management — admin only. */
adminRouter.get("/question-bank", requireAuth, requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  const subject = String(req.query.subject || "").trim().slice(0, 80);
  const filter: Record<string, unknown> = { isActive: true };
  if (subject) filter.subject = subject;
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { question: { $regex: escaped, $options: "i" } },
      { chapter: { $regex: escaped, $options: "i" } },
      { source: { $regex: escaped, $options: "i" } },
    ];
  }
  const [items, total] = await Promise.all([
    QuestionBankItem.find(filter).sort({ createdAt: -1 }).limit(300).lean(),
    QuestionBankItem.countDocuments(filter),
  ]);
  res.json({ ok: true, total, items: items.map((item) => ({
    id: String(item._id), question: item.question, subject: item.subject,
    grade: item.grade, chapter: item.chapter, questionType: item.questionType,
    difficulty: item.difficulty, source: item.source, createdAt: item.createdAt,
  })) });
});

adminRouter.post("/question-bank", requireAuth, requireAdmin, async (req, res) => {
  const parsed = questionBankSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_QUESTION_BANK_ITEM", "متن سؤال و درس را کامل و معتبر وارد کن.");
  const item = await QuestionBankItem.create(parsed.data);
  res.status(201).json({ ok: true, item: {
    id: String(item._id), question: item.question, subject: item.subject,
    grade: item.grade, chapter: item.chapter, questionType: item.questionType,
    difficulty: item.difficulty, source: item.source, createdAt: item.createdAt,
  } });
});

adminRouter.delete("/question-bank/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_QUESTION_ID", "شناسه سؤال معتبر نیست.");
  const item = await QuestionBankItem.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
  if (!item) throw new AppError(404, "QUESTION_NOT_FOUND", "سؤال پیدا نشد.");
  res.json({ ok: true, deletedId: id });
});

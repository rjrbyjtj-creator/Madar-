import express, { Router } from "express";
import { User } from "../models/User.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";
import { z } from "zod";
import { AppError } from "../utils/errors.js";
import { addQuestionItem, deactivateQuestionItem, deactivateQuestionBankFile, listQuestionItems, listQuestionBankFiles, questionBankFacets, saveQuestionBankFile, extractQuestionsFromPdf, updateQuestionBankFileQuestionCount } from "../services/question-bank-store.service.js";

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
  grade: z.enum(["10", "11", "12"]),
  chapter: z.string().trim().max(120).default(""),
  questionType: z.string().trim().max(60).default("ترکیبی"),
  difficulty: z.enum(["آسان", "متوسط", "سخت", "ترکیبی"]).default("متوسط"),
  source: z.string().trim().max(180).default(""),
});

/** Question bank — stored in dedicated tables in the existing Turso database. */
adminRouter.get("/question-bank", requireAuth, requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  const grade = String(req.query.grade || "").trim();
  const subject = String(req.query.subject || "").trim().slice(0, 80);
  if (grade && !["10", "11", "12"].includes(grade)) throw new AppError(400, "INVALID_GRADE", "پایه باید دهم، یازدهم یا دوازدهم باشد.");
  const [items, facets, files] = await Promise.all([
    listQuestionItems({ q, grade, subject, limit: 300 }),
    questionBankFacets(),
    listQuestionBankFiles({ grade, subject }),
  ]);
  res.json({ ok: true, total: facets.total, items, files, facets });
});

adminRouter.post("/question-bank", requireAuth, requireAdmin, async (req, res) => {
  const parsed = questionBankSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_QUESTION_BANK_ITEM", "درس، پایه و متن سؤال را کامل و معتبر وارد کن.");
  const item = await addQuestionItem(parsed.data);
  res.status(201).json({ ok: true, item });
});

adminRouter.post("/question-bank/files", requireAuth, requireAdmin,
  express.raw({ type: ["application/pdf", "text/plain"], limit: "25mb" }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 1) throw new AppError(400, "EMPTY_FILE", "فایل خالی است.");
    const fileName = decodeURIComponent(String(req.headers["x-file-name"] || "question-bank.txt")).slice(0, 180);
    const mimeType = String(req.headers["content-type"] || "application/octet-stream").split(";")[0];
    if (!["application/pdf", "text/plain"].includes(mimeType)) throw new AppError(415, "UNSUPPORTED_FILE_TYPE", "فعلاً فقط فایل PDF و TXT پشتیبانی می‌شود.");
    const subject = String(req.query.subject || "").trim().slice(0, 80);
    const grade = String(req.query.grade || "").trim();
    const chapter = String(req.query.chapter || "").trim().slice(0, 120);
    if (!subject || !["10", "11", "12"].includes(grade)) throw new AppError(400, "MISSING_CLASSIFICATION", "درس و پایه را مشخص کن.");
    const buffer = req.body as Buffer;
    if (mimeType === "application/pdf" && buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new AppError(400, "INVALID_PDF", "ساختار فایل PDF معتبر نیست.");
    let questionCount = 0;
    const file = await saveQuestionBankFile({ fileName, mimeType, subject, grade, chapter, buffer, questionCount });
    let processingWarning = "";
    if (mimeType === "text/plain") {
      const text = buffer.toString("utf8").replace(/^\uFEFF/, "").replace(/\r/g, "");
      const blocks = text.split(/\n\s*\n+/).map(part => part.trim()).filter(part => part.length >= 10);
      for (const question of blocks.slice(0, 300)) {
        await addQuestionItem({ question, subject, grade, chapter, questionType: "ترکیبی", difficulty: "متوسط", source: fileName });
        questionCount += 1;
      }
    } else {
      try {
        const extracted = await extractQuestionsFromPdf({ buffer, fileName, subject, grade, chapter });
        for (const item of extracted) {
          await addQuestionItem({ question: item.question, subject, grade, chapter: item.chapter, questionType: item.questionType, difficulty: item.difficulty, source: fileName });
          questionCount += 1;
        }
        if (!questionCount) processingWarning = "PDF ذخیره شد، اما سؤال قابل‌استخراج معتبری پیدا نشد؛ ممکن است کیفیت اسکن پایین یا محتوای فایل غیرسؤالی باشد.";
      } catch (error) {
        processingWarning = error instanceof Error ? error.message : "استخراج سؤال از PDF ناموفق بود.";
        console.error("[QUESTION_BANK] PDF extraction failed:", processingWarning);
      }
    }
    await updateQuestionBankFileQuestionCount(file.id, questionCount);
    res.status(201).json({ ok: true, file: { ...file, questionCount }, extractedCount: questionCount,
      warning: processingWarning || undefined,
      message: mimeType === "application/pdf"
        ? questionCount + " سؤال از PDF استخراج و به بانک سؤال اضافه شد."
        : questionCount + " سؤال از فایل متنی استخراج و به بانک سؤال اضافه شد." });
  }
);

adminRouter.delete("/question-bank/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  if (!id || id.length > 80) throw new AppError(400, "INVALID_QUESTION_ID", "شناسه سؤال معتبر نیست.");
  if (!await deactivateQuestionItem(id)) throw new AppError(404, "QUESTION_NOT_FOUND", "سؤال پیدا نشد.");
  res.json({ ok: true, deletedId: id });
});

adminRouter.delete("/question-bank/files/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  if (!id || id.length > 80) throw new AppError(400, "INVALID_FILE_ID", "شناسه فایل معتبر نیست.");
  if (!await deactivateQuestionBankFile(id)) throw new AppError(404, "FILE_NOT_FOUND", "فایل پیدا نشد.");
  res.json({ ok: true, deletedId: id });
});

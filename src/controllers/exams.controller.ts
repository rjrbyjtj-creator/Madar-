import mongoose from "mongoose";
import { z } from "zod";
import type { Request, Response } from "express";
import { Exam } from "../models/Exam.js";
import { AppError } from "../utils/errors.js";

const examInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  subject: z.string().trim().max(80).default(""),
  grade: z.string().trim().max(40).default(""),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.number().int().min(1).max(600).default(90),
  questionCount: z.number().int().min(1).max(1000).default(20),
  totalScore: z.number().min(1).max(10000).default(100),
});
const patchSchema = examInputSchema.partial();
type AuthUser = { _id: mongoose.Types.ObjectId; role?: string };

type ExamInput = z.infer<typeof examInputSchema>;
function parseExam(input: unknown): ExamInput;
function parseExam(input: unknown, partial: true): Partial<ExamInput>;
function parseExam(input: unknown, partial = false): ExamInput | Partial<ExamInput> {
  const parsed = partial ? patchSchema.safeParse(input) : examInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_EXAM", "اطلاعات آزمون معتبر نیست؛ عنوان، تاریخ و مدت آزمون را بررسی کن.");
  }
  return parsed.data;
}
function examDto(exam: any) {
  return {
    id: String(exam._id),
    title: exam.title,
    description: exam.description ?? "",
    subject: exam.subject ?? "",
    grade: exam.grade ?? "",
    status: exam.status,
    scheduledAt: exam.scheduledAt,
    durationMinutes: exam.durationMinutes,
    questionCount: exam.questionCount,
    totalScore: exam.totalScore,
    publishedAt: exam.publishedAt,
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
  };
}

/** GET /api/exams — فهرست آزمون‌های منتشرشده برای دانش‌آموز واردشده. */
export async function listPublishedExams(_req: Request, res: Response): Promise<void> {
  const exams = await Exam.find({ status: "published" })
    .select("-createdBy").sort({ scheduledAt: -1 }).limit(100).lean();
  const now = Date.now();
  const upcoming = exams.filter((exam) => new Date(exam.scheduledAt).getTime() >= now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const current = upcoming[0] ?? null;
  res.json({
    ok: true,
    exams: exams.map(examDto),
    currentExam: current ? examDto(current) : null,
    summary: {
      publishedCount: exams.length,
      upcomingCount: upcoming.length,
      latestExamAt: exams[0]?.scheduledAt ?? null,
    },
  });
}

/** GET /api/exams/admin — مدیریت آزمون‌ها؛ مدیر فقط. */
export async function listAdminExams(req: Request, res: Response): Promise<void> {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  if (status && !["draft", "published", "archived"].includes(status)) {
    throw new AppError(400, "INVALID_EXAM_STATUS", "وضعیت آزمون معتبر نیست.");
  }
  const filter = status ? { status } : {};
  const exams = await Exam.find(filter).sort({ scheduledAt: -1 }).limit(300).lean();
  res.json({ ok: true, exams: exams.map(examDto) });
}

/** POST /api/exams — ساخت آزمون پیش‌نویس؛ مدیر فقط. */
export async function createExam(req: Request, res: Response): Promise<void> {
  const input = parseExam(req.body);
  const user = res.locals.user as AuthUser;
  const exam = await Exam.create({ ...input, createdBy: user._id, status: "draft" });
  res.status(201).json({ ok: true, exam: examDto(exam.toObject()) });
}

/** PATCH /api/exams/:id — ویرایش آزمون؛ مدیر فقط. */
export async function updateExam(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_EXAM_ID", "شناسه آزمون معتبر نیست.");
  const input = parseExam(req.body, true);
  if (!Object.keys(input).length) throw new AppError(400, "EMPTY_EXAM_UPDATE", "موردی برای ویرایش ارسال نشده است.");
  const exam = await Exam.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean();
  if (!exam) throw new AppError(404, "EXAM_NOT_FOUND", "آزمون پیدا نشد.");
  res.json({ ok: true, exam: examDto(exam) });
}

/** POST /api/exams/:id/publish — انتشار آزمون؛ مدیر فقط. */
export async function publishExam(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_EXAM_ID", "شناسه آزمون معتبر نیست.");
  const exam = await Exam.findByIdAndUpdate(id, {
    $set: { status: "published", publishedAt: new Date() },
  }, { new: true, runValidators: true }).lean();
  if (!exam) throw new AppError(404, "EXAM_NOT_FOUND", "آزمون پیدا نشد.");
  res.json({ ok: true, exam: examDto(exam) });
}

/** DELETE /api/exams/:id — حذف آزمون؛ مدیر فقط. */
export async function deleteExam(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_EXAM_ID", "شناسه آزمون معتبر نیست.");
  const deleted = await Exam.findByIdAndDelete(id);
  if (!deleted) throw new AppError(404, "EXAM_NOT_FOUND", "آزمون پیدا نشد.");
  res.json({ ok: true, deletedId: id });
}

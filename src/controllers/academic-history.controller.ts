import mongoose from "mongoose";
import { z } from "zod";
import type { Request, Response } from "express";
import { StudentAcademicHistory } from "../models/StudentAcademicHistory.js";
import { AppError } from "../utils/errors.js";

const id = z.string().trim().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const grade = z.object({
  id, subject: z.string().trim().min(1).max(60),
  source: z.enum(["school", "maz", "ghalamchi"]),
  score: z.number().min(0).max(10000), outOf: z.number().min(0.01).max(10000).default(100), date: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(""),
});
const test = z.object({
  id, title: z.string().trim().min(1).max(120),
  provider: z.enum(["maz", "ghalamchi", "school", "other"]),
  date, totalScore: z.number().min(0).max(10000).nullable().default(null),
  regionScore: z.number().min(0).max(10000).nullable().default(null),
});
const note = z.object({
  id, date, subject: z.string().trim().max(60).default("عمومی"),
  color: z.enum(["blue", "green", "peach"]).default("blue"),
  text: z.string().trim().min(1).max(1500),
});
const performance = z.object({
  id, subject: z.string().trim().min(1).max(60), mastery: z.number().min(0).max(100),
});
const solved = z.object({
  id, label: z.string().trim().min(1).max(80), count: z.number().int().min(0).max(10000000),
});
const exam = z.object({
  id, title: z.string().trim().min(1).max(120), date,
  provider: z.enum(["maz", "ghalamchi", "school", "other"]),
});
const payloadSchema = z.object({
  grades: z.array(grade).max(200).default([]),
  tests: z.array(test).max(200).default([]),
  notes: z.array(note).max(500).default([]),
  performance: z.array(performance).max(100).default([]),
  solved: z.array(solved).max(30).default([]),
  exams: z.array(exam).max(200).default([]),
}).strict().superRefine((data, ctx) => {
  for (const key of ["grades", "tests", "notes", "performance", "solved", "exams"] as const) {
    const ids = data[key].map((item) => item.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: [key], message: "شناسه تکراری در سوابق وجود دارد." });
  }
});
type AuthUser = { _id: mongoose.Types.ObjectId; role?: string };
function student(res: Response): AuthUser {
  const user = res.locals.user as AuthUser;
  if (!user || user.role !== "student") throw new AppError(403, "STUDENT_ONLY", "این بخش فقط برای حساب دانش‌آموزی فعال است.");
  return user;
}
const emptyHistory = { grades: [], tests: [], notes: [], performance: [], solved: [], exams: [] };

export async function getAcademicHistory(_req: Request, res: Response): Promise<void> {
  const user = student(res);
  const record = await StudentAcademicHistory.findOne({ user: user._id })
    .select("grades tests notes performance solved exams updatedAt").lean();
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, history: record ?? emptyHistory });
}

export async function saveAcademicHistory(req: Request, res: Response): Promise<void> {
  const user = student(res);
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_ACADEMIC_HISTORY", "اطلاعات سابقه تحصیلی معتبر نیست؛ فیلدها و مقادیر را بررسی کن.");
  const history = await StudentAcademicHistory.findOneAndUpdate(
    { user: user._id },
    { $set: parsed.data },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).select("grades tests notes performance solved exams updatedAt").lean();
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, history });
}

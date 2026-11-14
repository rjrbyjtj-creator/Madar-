import mongoose from "mongoose";
import { z } from "zod";
import type { Request, Response } from "express";
import { Plan } from "../models/Plan.js";
import { AppError } from "../utils/errors.js";

const datePattern = /^\\d{4}-\\d{2}-\\d{2}$/;
const taskSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  type: z.enum(["study", "video", "test", "note"]),
  start: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
  end: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
  done: z.boolean().default(false),
}).refine((task) => task.end > task.start, { message: "Invalid task time range." });
const savePlanSchema = z.object({ tasks: z.array(taskSchema).max(100), note: z.string().max(4000).default("") });
type AuthUser = { _id: mongoose.Types.ObjectId; role?: string };

function requireStudent(res: Response): AuthUser {
  const user = res.locals.user as AuthUser;
  if (!user || user.role !== "student") throw new AppError(403, "STUDENT_ONLY", "این بخش فقط برای حساب دانش‌آموزی فعال است.");
  return user;
}
function validDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export async function listStudentPlans(req: Request, res: Response): Promise<void> {
  const user = requireStudent(res);
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  const filter: Record<string, unknown> = { user: user._id };
  if (from || to) {
    if (!validDate(from) || !validDate(to) || from > to) throw new AppError(400, "INVALID_DATE_RANGE", "بازه تاریخ معتبر نیست.");
    const span = (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000;
    if (span > 366) throw new AppError(400, "DATE_RANGE_TOO_LARGE", "بازه درخواست‌شده بیش از حد طولانی است.");
    filter.date = { $gte: from, $lte: to };
  }
  const plans = await Plan.find(filter).select("date tasks note updatedAt").sort({ date: 1 }).limit(370).lean();
  res.json({ ok: true, plans });
}
export async function saveStudentPlan(req: Request, res: Response): Promise<void> {
  const user = requireStudent(res);
  const date = String(req.params.date ?? "");
  if (!validDate(date)) throw new AppError(400, "INVALID_PLAN_DATE", "تاریخ برنامه معتبر نیست.");
  const parsed = savePlanSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_PLAN", "اطلاعات برنامه معتبر نیست؛ ساعت‌ها و عنوان فعالیت را بررسی کن.");
  const { tasks, note } = parsed.data;
  if (!tasks.length && !note.trim()) {
    await Plan.findOneAndDelete({ user: user._id, date });
    res.json({ ok: true, plan: { date, tasks: [], note: "" } });
    return;
  }
  const plan = await Plan.findOneAndUpdate(
    { user: user._id, date }, { $set: { tasks, note } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).select("date tasks note updatedAt").lean();
  res.json({ ok: true, plan });
}

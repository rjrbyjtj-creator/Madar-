import mongoose from "mongoose";
import { z } from "zod";
import type { Request, Response } from "express";
import { Plan } from "../models/Plan.js";
import { AppError } from "../utils/errors.js";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const taskSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  type: z.enum(["study", "video", "test", "note"]),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  done: z.boolean().default(false),
}).refine((task) => task.end > task.start, { message: "Invalid task time range." });
const savePlanSchema = z.object({ tasks: z.array(taskSchema).max(100), note: z.string().max(4000).default("") }).refine((value) => new Set(value.tasks.map((task) => task.id)).size === value.tasks.length, { message: "Duplicate task IDs are not allowed." });
const addTaskSchema = z.object({ task: taskSchema, note: z.string().max(4000).optional() });
const doneSchema = z.object({ done: z.boolean() });
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
  const taskCount = plans.reduce((sum, day) => sum + (day.tasks?.length ?? 0), 0);
  const completedCount = plans.reduce((sum, day) => sum + (day.tasks ?? []).filter((task) => task.done).length, 0);
  console.info("[PLANS] list", { count: plans.length, taskCount, from: from || null, to: to || null });
  res.json({ ok: true, plans, summary: { dayCount: plans.length, taskCount, completedCount, pendingCount: taskCount - completedCount } });
}
export async function saveStudentPlan(req: Request, res: Response): Promise<void> {
  const user = requireStudent(res);
  const date = String(req.params.date ?? "");
  if (!validDate(date)) throw new AppError(400, "INVALID_PLAN_DATE", "تاریخ برنامه معتبر نیست.");
  const parsed = savePlanSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_PLAN", "اطلاعات برنامه معتبر نیست؛ ساعت‌ها و عنوان فعالیت را بررسی کن.");
  const { tasks, note } = parsed.data;
  if (!tasks.length && !note.trim()) {
    const deleted = await Plan.findOneAndDelete({ user: user._id, date });
    console.info("[PLANS] cleared", { date, existed: Boolean(deleted) });
    res.json({ ok: true, plan: { date, tasks: [], note: "" } });
    return;
  }
  const plan = await Plan.findOneAndUpdate({ user: user._id, date }, { $set: { tasks, note } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true })
    .select("date tasks note updatedAt").lean();
  console.info("[PLANS] saved", { date, taskCount: plan?.tasks?.length ?? 0, persisted: Boolean(plan) });
  res.json({ ok: true, plan });
}


/** GET /api/plans/:date — خواندن یک روز مشخص برای رابط کاربری و ابزارهای هوش مصنوعی. */
export async function getStudentPlan(req: Request, res: Response): Promise<void> {
  const user = requireStudent(res);
  const date = String(req.params.date ?? "");
  if (!validDate(date)) throw new AppError(400, "INVALID_PLAN_DATE", "تاریخ برنامه معتبر نیست.");
  const plan = await Plan.findOne({ user: user._id, date })
    .select("date tasks note updatedAt")
    .lean();
  res.json({
    ok: true,
    plan: plan ?? { date, tasks: [], note: "" },
  });
}

/** POST /api/plans/:date/tasks — افزودن اتمیک از دید API یک فعالیت به روز. */
export async function addStudentPlanTask(req: Request, res: Response): Promise<void> {
  const user = requireStudent(res);
  const date = String(req.params.date ?? "");
  if (!validDate(date)) throw new AppError(400, "INVALID_PLAN_DATE", "تاریخ برنامه معتبر نیست.");
  const parsed = addTaskSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_PLAN_TASK", "اطلاعات فعالیت معتبر نیست؛ عنوان و ساعت‌ها را بررسی کن.");
  const { task, note } = parsed.data;
  let plan = await Plan.findOne({ user: user._id, date });
  if (!plan) plan = new Plan({ user: user._id, date, tasks: [], note: note ?? "" });
  if (plan.tasks.length >= 100) throw new AppError(400, "PLAN_TASK_LIMIT", "برای هر روز حداکثر ۱۰۰ فعالیت می‌توان ثبت کرد.");
  if (plan.tasks.some((item) => item.id === task.id)) throw new AppError(409, "DUPLICATE_PLAN_TASK", "این فعالیت قبلاً ثبت شده است.");
  plan.tasks.push(task);
  if (note !== undefined) plan.note = note;
  await plan.save();
  console.info("[PLANS] task-added", { date, taskId: task.id, taskCount: plan.tasks.length });
  res.status(201).json({ ok: true, plan: { date: plan.date, tasks: plan.tasks, note: plan.note, updatedAt: plan.updatedAt } });
}

/** PATCH /api/plans/:date/tasks/:taskId — تغییر وضعیت انجام فعالیت. */
export async function updateStudentPlanTask(req: Request, res: Response): Promise<void> {
  const user = requireStudent(res);
  const date = String(req.params.date ?? "");
  const taskId = String(req.params.taskId ?? "");
  if (!validDate(date) || !taskId || taskId.length > 64) throw new AppError(400, "INVALID_PLAN_TASK", "شناسه فعالیت یا تاریخ معتبر نیست.");
  const parsed = doneSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_PLAN_TASK_UPDATE", "وضعیت فعالیت معتبر نیست.");
  const plan = await Plan.findOneAndUpdate(
    { user: user._id, date, "tasks.id": taskId },
    { $set: { "tasks.$.done": parsed.data.done } },
    { new: true, runValidators: true },
  ).select("date tasks note updatedAt").lean();
  if (!plan) throw new AppError(404, "PLAN_TASK_NOT_FOUND", "این فعالیت در برنامه پیدا نشد.");
  console.info("[PLANS] task-updated", { date, taskId, done: parsed.data.done });
  res.json({ ok: true, plan });
}

/** DELETE /api/plans/:date/tasks/:taskId — حذف یک فعالیت بدون جایگزینی کل برنامه روز. */
export async function deleteStudentPlanTask(req: Request, res: Response): Promise<void> {
  const user = requireStudent(res);
  const date = String(req.params.date ?? "");
  const taskId = String(req.params.taskId ?? "");
  if (!validDate(date) || !taskId || taskId.length > 64) throw new AppError(400, "INVALID_PLAN_TASK", "شناسه فعالیت یا تاریخ معتبر نیست.");
  const plan = await Plan.findOneAndUpdate(
    { user: user._id, date, "tasks.id": taskId },
    { $pull: { tasks: { id: taskId } } },
    { new: true, runValidators: true },
  ).select("date tasks note updatedAt");
  if (!plan) throw new AppError(404, "PLAN_TASK_NOT_FOUND", "این فعالیت در برنامه پیدا نشد.");
  if (plan.tasks.length === 0 && !plan.note.trim()) {
    await Plan.deleteOne({ _id: plan._id, user: user._id });
    console.info("[PLANS] task-removed", { date, taskId, dayRemoved: true });
    res.json({ ok: true, plan: { date, tasks: [], note: "" } });
    return;
  }
  console.info("[PLANS] task-removed", { date, taskId, dayRemoved: false });
  res.json({ ok: true, plan: { date: plan.date, tasks: plan.tasks, note: plan.note, updatedAt: plan.updatedAt } });
}

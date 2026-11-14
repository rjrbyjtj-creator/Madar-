import mongoose from "mongoose";
import { z } from "zod";
import { Plan } from "../models/Plan.js";

const taskSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  type: z.enum(["study", "video", "test", "note"]),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  done: z.boolean().default(false),
}).refine((task) => task.end > task.start, { message: "Invalid task time range." });

const proposalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z.array(taskSchema).max(100),
  note: z.string().max(4000).default(""),
});

export type PlannerProposal = z.infer<typeof proposalSchema>;

export const plannerToolDeclarations = [
  {
    name: "get_my_plans",
    description: "برنامه‌های ذخیره‌شده همین دانش‌آموز را برای بازه تاریخ مشخص بخوان. هر وقت دانش‌آموز گفت برنامه‌ام را ببین، بررسی کن، امروز یا فردای من چه برنامه‌ای دارد یا درباره برنامه‌اش نظر بده، این ابزار را اجرا کن. این ابزار فقط خواندنی است.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "شروع بازه به فرمت YYYY-MM-DD" },
        to: { type: "string", description: "پایان بازه به فرمت YYYY-MM-DD" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "propose_plan",
    description: "یک پیش‌نویس برنامه برای تاریخ مشخص بساز تا به دانش‌آموز نشان داده شود. این ابزار چیزی را ذخیره نمی‌کند؛ ثبت فقط پس از تأیید صریح دانش‌آموز در رابط چت انجام می‌شود.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "تاریخ برنامه به فرمت YYYY-MM-DD" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              type: { type: "string", enum: ["study", "video", "test", "note"] },
              start: { type: "string", description: "ساعت شروع HH:mm" },
              end: { type: "string", description: "ساعت پایان HH:mm" },
              done: { type: "boolean" },
            },
            required: ["id", "title", "type", "start", "end", "done"],
          },
        },
        note: { type: "string" },
      },
      required: ["date", "tasks"],
    },
  },
] as const;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function executePlannerTool(
  name: string,
  args: unknown,
  userId: mongoose.Types.ObjectId,
): Promise<{ result: Record<string, unknown>; proposal?: PlannerProposal }> {
  if (name === "get_my_plans") {
    const parsed = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).safeParse(args);
    if (!parsed.success || !validDate(parsed.data.from) || !validDate(parsed.data.to) || parsed.data.from > parsed.data.to) {
      return { result: { ok: false, error: "بازه تاریخ معتبر نیست. از فرمت YYYY-MM-DD استفاده کن." } };
    }
    const days = (Date.parse(parsed.data.to + "T00:00:00Z") - Date.parse(parsed.data.from + "T00:00:00Z")) / 86400000;
    if (days > 90) return { result: { ok: false, error: "بازه خواندن برنامه حداکثر ۹۰ روز است." } };
    const plans = await Plan.find({
      user: userId,
      date: { $gte: parsed.data.from, $lte: parsed.data.to },
    }).select("date tasks note").sort({ date: 1 }).limit(91).lean();
    return {
      result: {
        ok: true,
        from: parsed.data.from,
        to: parsed.data.to,
        count: plans.length,
        plans: plans.map((day) => ({
          date: day.date,
          tasks: (day.tasks ?? []).map((task) => ({
            title: task.title,
            type: task.type,
            start: task.start,
            end: task.end,
            done: Boolean(task.done),
          })),
          note: day.note || "",
        })),
      },
    };
  }

  if (name === "propose_plan") {
    const parsed = proposalSchema.safeParse(args);
    if (!parsed.success || !validDate(parsed.data.date)) {
      return { result: { ok: false, error: "پیش‌نویس برنامه معتبر نیست. تاریخ، ساعت‌ها و نوع فعالیت‌ها را بررسی کن." } };
    }
    return {
      result: { ok: true, message: "پیش‌نویس آماده شد؛ هنوز ذخیره نشده و منتظر تأیید دانش‌آموز است.", date: parsed.data.date, taskCount: parsed.data.tasks.length },
      proposal: parsed.data,
    };
  }

  return { result: { ok: false, error: "ابزار ناشناخته است." } };
}

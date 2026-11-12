import type { z } from "zod";
import { AppError } from "./errors.js";

const FIELD_MESSAGES: Record<string, string> = {
  name: "اسمت رو درست وارد کن.",
  email: "یه ایمیل معتبر وارد کن.",
  phone: "شماره‌ی موبایل معتبر وارد کن (مثل ۰۹۱۲…).",
  chat: "آیدی (مثل @username) یا شناسه‌ی عددی رو درست وارد کن.",
  pass: "رمز باید حداقل ۶ کاراکتر باشه.",
  code: "کد باید شش رقم باشه.",
  user: "ایمیل، نام کاربری یا شماره‌ی موبایل رو وارد کن.",
  type: "روش ورود نامعتبره.",
};

/** بدنه‌ی درخواست را با schema اعتبارسنجی می‌کند؛ فیلدهای اضافه حذف می‌شوند. */
export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
): z.output<T> {
  const result = schema.safeParse(body ?? {});

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? ""))),
    ].filter(Boolean);

    throw new AppError(
      400,
      "VALIDATION_ERROR",
      FIELD_MESSAGES[fields[0] ?? ""] ?? "اطلاعات واردشده معتبر نیست.",
      { fields },
    );
  }

  return result.data;
}
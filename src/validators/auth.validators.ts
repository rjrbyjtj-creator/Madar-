import { AppError } from "../utils/errors.js";
import {
  EMAIL_RE,
  normalizeDigits,
  normalizePhone,
  parseChatInput,
} from "../utils/normalize.js";

/*
 * اعتبارسنجی بدنه‌ی درخواست‌ها (بدون وابستگی به zod).
 * فقط فیلدهای مجاز برگردانده می‌شوند؛ هر فیلد اضافه (مثل role) نادیده گرفته می‌شود.
 */

export type SendRegisterCodeInput = {
  chat: string;
  phone: string;
  email?: string;
};

export type VerifyRegisterInput = {
  chat: string;
  phone: string;
  code: string;
  name: string;
  email: string;
  pass: string;
};

export type LoginInput = {
  type: "id" | "phone";
  user: string;
  pass: string;
  remember: boolean;
};

export type ForgotSendCodeInput = { phone: string };

export type ResetPasswordInput = { phone: string; code: string; pass: string };

const MESSAGES: Record<string, string> = {
  name: "اسمت رو درست وارد کن.",
  email: "یه ایمیل معتبر وارد کن.",
  phone: "شماره‌ی موبایل معتبر وارد کن (مثل ۰۹۱۲…).",
  chat: "آیدی (مثل @username) یا شناسه‌ی عددی رو درست وارد کن.",
  pass: "رمز باید حداقل ۶ کاراکتر باشه.",
  code: "کد باید شش رقم باشه.",
  user: "ایمیل، نام کاربری یا شماره‌ی موبایل رو وارد کن.",
  type: "روش ورود نامعتبره.",
};

type Body = Record<string, unknown>;

function toBody(input: unknown): Body {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Body)
    : {};
}

function invalid(field: string): AppError {
  return new AppError(
    400,
    "VALIDATION_ERROR",
    MESSAGES[field] ?? "اطلاعات واردشده معتبر نیست.",
    { fields: [field] },
  );
}

function text(body: Body, field: string): string {
  const value = body[field];
  if (typeof value !== "string") throw invalid(field);
  return value.trim();
}

function chatField(body: Body): string {
  const value = text(body, "chat");
  if (!parseChatInput(value)) throw invalid("chat");
  return value;
}

function phoneField(body: Body): string {
  const phone = normalizePhone(text(body, "phone"));
  if (!phone) throw invalid("phone");
  return phone;
}

function emailField(body: Body): string {
  const email = text(body, "email").toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw invalid("email");
  return email;
}

function nameField(body: Body): string {
  const name = text(body, "name");
  if (name.length < 2 || name.length > 100) throw invalid("name");
  return name;
}

function codeField(body: Body): string {
  const code = normalizeDigits(text(body, "code"));
  if (!/^\d{6}$/.test(code)) throw invalid("code");
  return code;
}

// bcrypt فقط ۷۲ بایت اول رمز را می‌خواند؛ بیشتر از آن را رد می‌کنیم.
function newPasswordField(body: Body): string {
  const pass = body.pass;
  if (
    typeof pass !== "string" ||
    pass.length < 6 ||
    Buffer.byteLength(pass, "utf8") > 72
  ) {
    throw invalid("pass");
  }
  return pass;
}

export function parseSendRegisterCode(input: unknown): SendRegisterCodeInput {
  const body = toBody(input);
  const chat = chatField(body);
  const phone = phoneField(body);

  // ایمیل اختیاری است؛ اگر فرستاده شد باید معتبر باشد.
  if (body.email === undefined || body.email === null || body.email === "") {
    return { chat, phone };
  }

  return { chat, phone, email: emailField(body) };
}

export function parseVerifyRegister(input: unknown): VerifyRegisterInput {
  const body = toBody(input);

  return {
    chat: chatField(body),
    phone: phoneField(body),
    code: codeField(body),
    name: nameField(body),
    email: emailField(body),
    pass: newPasswordField(body),
  };
}

export function parseLogin(input: unknown): LoginInput {
  const body = toBody(input);

  const type = body.type;
  if (type !== "id" && type !== "phone") throw invalid("type");

  const user = text(body, "user");
  if (user.length < 1 || user.length > 254) throw invalid("user");

  const pass = body.pass;
  if (typeof pass !== "string" || pass.length < 1 || pass.length > 200) {
    throw invalid("pass");
  }

  return { type, user, pass, remember: body.remember === true };
}

export function parseForgotSendCode(input: unknown): ForgotSendCodeInput {
  return { phone: phoneField(toBody(input)) };
}

export function parseResetPassword(input: unknown): ResetPasswordInput {
  const body = toBody(input);

  return {
    phone: phoneField(body),
    code: codeField(body),
    pass: newPasswordField(body),
  };
}
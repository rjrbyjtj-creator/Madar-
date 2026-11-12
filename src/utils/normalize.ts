const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** ارقام فارسی و عربی را به انگلیسی تبدیل می‌کند. */
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const persian = PERSIAN_DIGITS.indexOf(ch);
    return String(persian >= 0 ? persian : ARABIC_DIGITS.indexOf(ch));
  });
}

/**
 * شماره‌ی موبایل ایران را به شکل استاندارد 09xxxxxxxxx برمی‌گرداند.
 * ورودی‌های مجاز: 09123456789، 9123456789، +989123456789، 00989123456789، 989123456789
 */
export function normalizePhone(input: string): string | null {
  const cleaned = normalizeDigits(input).replace(/[\s\-()]/g, "");
  const match = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(cleaned);
  return match ? `0${match[1]}` : null;
}

export type ParsedChat =
  | { kind: "id"; chatId: string }
  | { kind: "username"; username: string };

/** ورودی «آیدی چت»: یا شناسه‌ی عددی تلگرام یا @username */
export function parseChatInput(input: string): ParsedChat | null {
  const value = normalizeDigits(input).trim();

  if (/^\d{5,14}$/.test(value)) {
    return { kind: "id", chatId: value };
  }

  const match = /^@?([A-Za-z][A-Za-z0-9_]{4,31})$/.exec(value);
  return match ? { kind: "username", username: match[1].toLowerCase() } : null;
}
import { TelegramContact } from "../models/TelegramContact.js";
import { AppError } from "../utils/errors.js";
import { parseChatInput } from "../utils/normalize.js";
import { getBotUsername } from "./telegram.service.js";

export type ResolvedChat = { chatId: string; username: string | null };

/** «ربات @name» یا فقط «ربات» اگر نام ربات هنوز معلوم نیست. */
export async function botLabel(): Promise<string> {
  const username = await getBotUsername();
  return username ? `ربات @${username}` : "ربات";
}

/**
 * ورودی «آیدی چت» را به chat id واقعی تلگرام تبدیل می‌کند.
 * - شناسه‌ی عددی: همان را برمی‌گرداند.
 * - @username: باید قبلاً ربات را Start کرده باشد تا chat id او را بدانیم.
 */
export async function resolveTelegramChat(rawChat: string): Promise<ResolvedChat> {
  const parsed = parseChatInput(rawChat);

  if (!parsed) {
    throw new AppError(
      400,
      "INVALID_CHAT",
      "آیدی (مثل @username) یا شناسه‌ی عددی رو درست وارد کن.",
    );
  }

  if (parsed.kind === "id") {
    const contact = await TelegramContact.findOne({ chatId: parsed.chatId }).lean();
    return { chatId: parsed.chatId, username: contact?.username ?? null };
  }

  const contact = await TelegramContact.findOne({ username: parsed.username })
    .sort({ lastSeenAt: -1 })
    .lean();

  if (!contact) {
    throw new AppError(
      404,
      "TELEGRAM_NOT_STARTED",
      `اول ${await botLabel()} رو توی تلگرام Start کن، بعد دوباره امتحان کن.`,
    );
  }

  return { chatId: contact.chatId, username: contact.username ?? null };
}
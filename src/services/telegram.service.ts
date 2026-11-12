import "dotenv/config";
import { TelegramContact } from "../models/TelegramContact.js";

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from?: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

/** خطای برگشتی از Telegram Bot API (مثلاً chat not found یا bot was blocked). */
export class TelegramApiError extends Error {
  readonly status: number;
  readonly errorCode: number | undefined;

  constructor(message: string, status: number, errorCode?: number) {
    super(message);
    this.name = "TelegramApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

const POLLING_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 3_000;

let isPolling = false;
let pollingTask: Promise<void> | null = null;
let nextUpdateOffset = 0;
let cachedBotUsername: string | null | undefined;

function requireApiUrl(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  return `https://api.telegram.org/bot${token}`;
}

async function telegramRequest<T>(
  method: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${requireApiUrl()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
    signal: AbortSignal.timeout(35_000),
  });

  const data = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !data.ok) {
    throw new TelegramApiError(
      data.description ?? `Telegram API request failed (${response.status}).`,
      response.status,
      data.error_code,
    );
  }

  return data.result as T;
}

/** نام کاربری ربات (بدون @)؛ برای نمایش در پیام‌های راهنما. */
export async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername !== undefined) return cachedBotUsername;

  try {
    const me = await telegramRequest<{ username?: string }>("getMe");
    cachedBotUsername = me.username ?? null;
    return cachedBotUsername;
  } catch {
    return null; // خطا را کش نمی‌کنیم تا دفعه‌ی بعد دوباره امتحان شود.
  }
}

export async function sendTelegramMessage(
  chatId: string | number,
  message: string,
  options: { html?: boolean } = {},
): Promise<void> {
  await telegramRequest("sendMessage", {
    chat_id: String(chatId),
    text: message,
    disable_web_page_preview: true,
    ...(options.html ? { parse_mode: "HTML" } : {}),
  });
}

/**
 * Sends a registration/login verification code.
 * OTP generation, hashing, expiry and one-time verification belong in the
 * backend + database. This service only delivers the code to Telegram.
 */
export async function sendTelegramCode(
  chatId: string | number,
  code: string,
  expiresInMinutes = 3,
): Promise<void> {
  const safeCode = String(code).trim();

  if (!/^\d{6}$/.test(safeCode)) {
    throw new Error("Verification code must contain exactly 6 digits.");
  }

  // کد داخل <code> می‌رود تا با یک لمس کپی شود (فقط رقم است، نیازی به escape نیست).
  const message = [
    "🔐 تأیید هویت حساب مدار",
    "",
    `کد تأیید شما: <code>${safeCode}</code>`,
    "",
    `⏳ اعتبار کد: ${expiresInMinutes} دقیقه`,
    "",
    "این کد را فقط در وب‌سایت مدار وارد کنید.",
    "اگر شما این درخواست را ثبت نکرده‌اید، این پیام را نادیده بگیرید.",
    "",
    "🛡️ تیم پشتیبانی مدار",
  ].join("\n");

  await sendTelegramMessage(chatId, message, { html: true });
}

/**
 * هر کسی که با ربات حرف بزند را (chat id + username) ذخیره می‌کنیم
 * تا بتوانیم کد را به @username او بفرستیم.
 */
async function rememberContact(
  chatId: number,
  from: TelegramUser | undefined,
): Promise<void> {
  try {
    const id = String(chatId);
    const username = from?.username?.toLowerCase();
    const firstName = from?.first_name ?? "";

    if (username) {
      // اگر این username قبلاً به chat دیگری وصل بوده (انتقال username)، از آن جدا می‌شود.
      await TelegramContact.updateMany(
        { username, chatId: { $ne: id } },
        { $unset: { username: "" } },
      );
      await TelegramContact.updateOne(
        { chatId: id },
        { $set: { username, firstName, lastSeenAt: new Date() } },
        { upsert: true },
      );
    } else {
      await TelegramContact.updateOne(
        { chatId: id },
        {
          $set: { firstName, lastSeenAt: new Date() },
          $unset: { username: "" },
        },
        { upsert: true },
      );
    }
  } catch (error) {
    console.error(
      "Telegram contact save failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  await telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
  });
}

async function handleCallbackQuery(
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  await answerCallbackQuery(callbackQuery.id);

  const chat = callbackQuery.message?.chat;
  if (!chat || chat.type !== "private") return;

  await rememberContact(chat.id, callbackQuery.from);

  if (callbackQuery.data === "show_chat_id") {
    await sendTelegramMessage(
      chat.id,
      [
        "🆔 شناسه عددی تلگرام شما:",
        "",
        String(chat.id),
        "",
        "این شناسه را در بخش مربوط به تلگرام در وب‌سایت مدار وارد کنید.",
        "برای دریافت کد تأیید، ابتدا باید همین ربات را Start کرده باشید.",
      ].join("\n"),
    );
  }
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  // ربات فقط در چت خصوصی کار می‌کند؛ کد تأیید نباید به گروه برود.
  if (message.chat.type !== "private") return;

  const chatId = message.chat.id;
  const text = message.text?.trim() ?? "";

  await rememberContact(chatId, message.from);

  if (text === "/start" || text.startsWith("/start ")) {
    await telegramRequest("sendMessage", {
      chat_id: String(chatId),
      text: [
        "سلام، به ربات رسمی مدار خوش آمدید. 👋",
        "",
        "این ربات برای ارسال امن کدهای تأیید حساب کاربری مدار استفاده می‌شود.",
        "",
        "برای اتصال تلگرام به حساب خود، در فرم ثبت‌نام وب‌سایت می‌توانید آیدی تلگرام خود (مثل @username) یا شناسه عددی زیر را وارد کنید:",
        "",
        String(chatId),
        "",
        "🔒 کدهای تأیید فقط برای همین گفت‌وگوی خصوصی ارسال می‌شوند.",
        "هرگز کد تأیید خود را در اختیار دیگران قرار ندهید.",
      ].join("\n"),
      reply_markup: {
        inline_keyboard: [
          [{ text: "🆔 نمایش شناسه تلگرام من", callback_data: "show_chat_id" }],
        ],
      },
    });
    return;
  }

  if (text === "/help") {
    await sendTelegramMessage(
      chatId,
      [
        "راهنمای ربات مدار",
        "",
        "/start — شروع و دریافت شناسه تلگرام",
        "/help — نمایش این راهنما",
        "",
        "برای دریافت کد تأیید، فرایند ثبت‌نام یا ورود را در وب‌سایت مدار آغاز کنید.",
      ].join("\n"),
    );
  }
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  if (update.message) {
    await handleMessage(update.message);
  }
}

async function pollingLoop(): Promise<void> {
  // اگر قبلاً webhook ست شده باشد، getUpdates خطای 409 می‌دهد.
  try {
    await telegramRequest("deleteWebhook", { drop_pending_updates: false });
  } catch (error) {
    console.error(
      "Telegram deleteWebhook failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  while (isPolling) {
    try {
      const updates = await telegramRequest<TelegramUpdate[]>("getUpdates", {
        offset: nextUpdateOffset,
        timeout: POLLING_TIMEOUT_SECONDS,
        allowed_updates: ["message", "callback_query"],
      });

      for (const update of updates ?? []) {
        // Advance the offset so a processed update is not handled again.
        nextUpdateOffset = update.update_id + 1;

        try {
          await processUpdate(update);
        } catch (error) {
          // Do not log message contents or verification codes.
          console.error(
            "Telegram update processing failed:",
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      }
    } catch (error) {
      if (!isPolling) break;

      console.error(
        "Telegram polling failed. Retrying shortly:",
        error instanceof Error ? error.message : "Unknown error",
      );

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

/**
 * Starts long polling once. Call this once during backend startup,
 * after dotenv has loaded and MongoDB is connected.
 */
export function startTelegramBot(): void {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn(
      "Telegram bot is disabled: TELEGRAM_BOT_TOKEN is missing from .env.",
    );
    return;
  }

  if (isPolling) {
    console.warn("Telegram bot polling is already running.");
    return;
  }

  isPolling = true;
  console.log("Telegram bot (Madar) is starting...");

  void getBotUsername();

  pollingTask = pollingLoop().finally(() => {
    isPolling = false;
    pollingTask = null;
  });
}

/** Gracefully stops polling, for example during server shutdown. */
export async function stopTelegramBot(): Promise<void> {
  isPolling = false;
  await pollingTask;
}
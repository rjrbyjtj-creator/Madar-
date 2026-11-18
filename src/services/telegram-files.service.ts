import { randomBytes } from "node:crypto";
import { User } from "../models/User.js";
import { StudyFile } from "../models/StudyFile.js";
import { saveMusicTrack } from "./music-store.service.js";
import { hashPassword } from "../utils/security.js";

type TgResponse<T> = { ok: boolean; result?: T; description?: string };
type TgDocument = { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
type TgAudio = TgDocument & { title?: string; performer?: string; duration?: number; file_name?: string; mime_type?: string; file_size?: number };
type TgMessage = { message_id: number; chat: { id: number; type: string }; from?: { id: number; first_name?: string; last_name?: string; username?: string }; text?: string; caption?: string; document?: TgDocument; audio?: TgAudio };
type TgUpdate = { update_id: number; message?: TgMessage };
type TelegramAdminAccount = { _id: any; name: string; role: "admin" | "student" | "teacher"; telegramChatId?: string | null };

const token = () => process.env.TELEGRAM_FILES_BOT_TOKEN?.trim() || "";
async function api<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const key = token();
  if (!key) throw new Error("TELEGRAM_FILES_BOT_TOKEN is missing");
  const response = await fetch(`https://api.telegram.org/bot${key}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(40_000),
  });
  const data = await response.json() as TgResponse<T>;
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram API ${response.status}`);
  return data.result as T;
}

async function reply(chatId: number, text: string): Promise<void> {
  await api("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}
async function handle(message: TgMessage): Promise<void> {
  if (message.chat.type !== "private") return;
  const chatId = String(message.chat.id);
  let admin = await User.findOne({ telegramChatId: chatId, role: "admin", isActive: true }).select("_id name").lean<{ _id: any; name: string }>();
  if (message.text?.startsWith("/start")) {
    // Provision one dedicated admin integration account for the explicitly
    // allowlisted Telegram username. The numeric ID comes from Telegram's
    // authenticated private-chat update, never from user-supplied text.
    const senderUsername = message.from?.username?.replace(/^@/, "").toLowerCase();
    if (!admin && message.from?.id && message.chat.id === message.from.id && senderUsername === "amir168shad") {
      // The owner explicitly authorized promotion of the existing site account
      // bound to this Telegram numeric ID. Promote only that exact active account.
      let account = await User.findOne({ telegramChatId: chatId, isActive: true })
        .select("_id name role telegramChatId").lean<TelegramAdminAccount>();
      if (account && account.role !== "admin") {
        await User.updateOne(
          { _id: account._id, telegramChatId: chatId, isActive: true },
          { $set: { role: "admin", telegramUsername: "amir168shad", isTelegramVerified: true } },
        );
        account = await User.findOne({ _id: account._id, telegramChatId: chatId, role: "admin", isActive: true })
          .select("_id name role telegramChatId").lean<TelegramAdminAccount>();
        console.info("[TELEGRAM_FILES] existing Telegram-linked account promoted to admin");
      }
      if (!account) {
        const randomPassword = randomBytes(48).toString("hex");
        try {
          const created = await User.create({
            name: "مدیر فایل‌های مدار",
            email: `telegram-${message.from.id}@accounts.madar.invalid`,
            phone: `tg-${message.from.id}`,
            passwordHash: await hashPassword(randomPassword),
            telegramUsername: "amir168shad",
            telegramChatId: chatId,
            role: "admin",
            isTelegramVerified: true,
            isActive: true,
          });
          account = { _id: created._id, name: created.name, role: created.role, telegramChatId: created.telegramChatId };
        } catch (error) {
          console.error("[TELEGRAM_FILES] admin provisioning failed:", error instanceof Error ? error.message : error);
          account = await User.findOne({ telegramUsername: "amir168shad" }).select("_id name role telegramChatId").lean<TelegramAdminAccount>();
        }
      } else if (account.role === "admin" && (!account.telegramChatId || account.telegramChatId === chatId)) {
        await User.updateOne(
          { _id: account._id, role: "admin", $or: [{ telegramChatId: { $exists: false } }, { telegramChatId: "" }, { telegramChatId: chatId }] },
          { $set: { telegramChatId: chatId, isTelegramVerified: true } },
        );
        account = await User.findOne({ _id: account._id, telegramChatId: chatId, role: "admin", isActive: true }).select("_id name role telegramChatId").lean<TelegramAdminAccount>();
      }
      if (account?.role === "admin" && account.telegramChatId === chatId) {
        admin = { _id: account._id, name: account.name };
      }
    }
    await reply(message.chat.id, admin
      ? "✅ حساب مدیر فایل‌های مدار ساخته/متصل شد. حالا فایل PDF یا آهنگ را به‌صورت فایل ارسال کن."
      : "⛔️ اتصال انجام نشد. باید از حساب تلگرام @amir168shad در گفتگوی خصوصی همین ربات پیام بدهی. اگر این نام کاربری قبلاً به حساب غیرمدیر دیگری در سایت متصل باشد، برای امنیت ارتقای خودکار انجام نمی‌شود.");
    return;
  }
  if (!admin) {
    await reply(message.chat.id, "⛔️ دسترسی ارسال فایل فقط برای حساب تلگرام متصل به مدیر سامانه مجاز است.");
    return;
  }
  const doc = message.document;
  const audioExtensions = /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)$/i;
  const audioMedia = message.audio || (doc && ((doc.mime_type || "").startsWith("audio/") || audioExtensions.test(doc.file_name || "")) ? doc as TgAudio : undefined);
  if (audioMedia) {
    const fileName = (audioMedia.file_name || audioMedia.title || "track.mp3").trim().slice(0, 240);
    const mimeType = (audioMedia.mime_type || "audio/mpeg").toLowerCase();
    const size = Number(audioMedia.file_size || 0);
    const duration = Math.max(1, Math.floor(Number(audioMedia.duration || 0)));
    if (!audioExtensions.test(fileName) && !mimeType.startsWith("audio/")) {
      await reply(message.chat.id, "⛔️ فرمت فایل صوتی پشتیبانی نمی‌شود. MP3، M4A، AAC، OGG، WAV و FLAC بفرست.");
      return;
    }
    if (size < 1 || size > 20 * 1024 * 1024) {
      await reply(message.chat.id, "⛔️ حجم آهنگ باید بیشتر از صفر و حداکثر ۲۰ مگابایت باشد تا تلگرام بتواند آن را برای پخش سایت ارائه کند.");
      return;
    }
    const caption = (message.caption || "").trim().slice(0, 1000);
    const field = (key: string) => {
      const match = caption.match(new RegExp("(?:^|\\n)" + key + "\\s*[:：-]\\s*([^\\n]+)", "i"));
      return match?.[1]?.trim() || "";
    };
    const title = (audioMedia.title || field("عنوان") || caption.split("\n")[0] || fileName.replace(audioExtensions, "")).trim().slice(0, 180) || "آهنگ جدید";
    const artist = (audioMedia.performer || field("خواننده") || "نامشخص").trim().slice(0, 120);
    const album = field("آلبوم").slice(0, 120);
    const category = (field("دسته") || field("سبک") || "عمومی").slice(0, 60);
    try {
      const saved = await saveMusicTrack({
        telegramFileId: audioMedia.file_id, telegramFileUniqueId: audioMedia.file_unique_id,
        title, artist, album, category, duration, fileName, mimeType, fileSize: size, caption,
        uploadedByChatId: chatId,
        uploadedByName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" "),
        telegramMessageId: message.message_id,
      });
      await reply(message.chat.id, "🎵 آهنگ با موفقیت در پایگاه داده موسیقی مدار ثبت شد.\n\n🎧 " + saved.title + "\n👤 " + saved.artist + "\n⏱ " + Math.floor(saved.duration/60) + ":" + String(saved.duration%60).padStart(2,"0") + "\n📦 " + Math.ceil(saved.fileSize/1024) + " کیلوبایت\n\nدر فهرست آهنگ‌های سایت نمایش داده می‌شود.");
    } catch (error) {
      console.error("[TELEGRAM_FILES] music save failed:", error instanceof Error ? error.message : error);
      await reply(message.chat.id, "⛔️ ثبت آهنگ انجام نشد. اتصال دیتابیس Turso بخش موسیقی را بررسی کن و دوباره بفرست.");
    }
    return;
  }
  if (!doc) {
    await reply(message.chat.id, "لطفاً فایل PDF را به‌صورت Document ارسال کن.");
    return;
  }
  const fileName = (doc.file_name || "document.pdf").trim();
  if (doc.mime_type !== "application/pdf" && !fileName.toLowerCase().endsWith(".pdf")) {
    await reply(message.chat.id, "فقط فایل PDF پذیرفته می‌شود.");
    return;
  }
  if ((doc.file_size ?? 0) > 25 * 1024 * 1024) {
    await reply(message.chat.id, "حجم فایل نباید بیشتر از ۲۵ مگابایت باشد.");
    return;
  }
  const caption = (message.caption || "").trim();
  const subjectText = [caption, fileName.replace(/\.pdf$/i, "")].join(" ").toLowerCase();
  const subjectAliases: Array<[string, string[]]> = [
    ["فیزیک", ["فیزیک", "physics"]],
    ["ریاضی", ["ریاضی", "ریاضیات", "math", "mathematics"]],
    ["شیمی", ["شیمی", "chemistry"]],
    ["زیست‌شناسی", ["زیست‌شناسی", "زیست شناسی", "زیست", "biology"]],
    ["ادبیات", ["ادبیات", "فارسی", "literature"]],
    ["زبان انگلیسی", ["زبان انگلیسی", "انگلیسی", "english"]],
    ["عربی", ["عربی"]],
    ["دینی", ["دینی", "دین و زندگی"]],
  ];
  const labeledPrefix = ["درس:", "درس：", "درس-", "موضوع:", "موضوع：", "موضوع-"].find(prefix => caption.startsWith(prefix));
  const bracketedSubject = caption.startsWith("[") ? caption.slice(1).split("]")[0] : "";
  const labeledSubject = labeledPrefix
    ? caption.slice(labeledPrefix.length).split(/[\n،,;؛]/)[0]
    : bracketedSubject;
  const matchedSubject = subjectAliases.find(([, aliases]) => aliases.some(alias => subjectText.includes(alias)));
  const plainCaption = (caption.startsWith("درس ") ? caption.slice(5) : caption).trim();
  const subject = (labeledSubject?.trim() || matchedSubject?.[0] || (plainCaption.length <= 60 ? plainCaption : "") || "عمومی").slice(0, 60) || "عمومی";
  const saved = await StudyFile.findOneAndUpdate(
    { telegramFileUniqueId: doc.file_unique_id },
    { $set: {
      telegramFileId: doc.file_id, fileName, mimeType: "application/pdf",
      fileSize: doc.file_size || 1, caption, subject,
      uploadedByChatId: chatId,
      uploadedByName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" "),
      telegramMessageId: message.message_id, isActive: true,
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await reply(message.chat.id, `✅ فایل در سامانه ثبت شد.\n\n📄 ${saved.fileName}\n📦 ${Math.ceil(saved.fileSize / 1024)} کیلوبایت\n🆔 ${saved.id}\n\nفایل از بخش فایل‌های درسی سایت قابل مشاهده و دریافت است.`);
}

let running = false;
let task: Promise<void> | null = null;
let offset = 0;
async function loop(): Promise<void> {
  try { await api("deleteWebhook", { drop_pending_updates: false }); } catch (e) {
    console.error("[TELEGRAM_FILES] deleteWebhook:", e instanceof Error ? e.message : e);
  }
  while (running) {
    try {
      const updates = await api<TgUpdate[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] });
      for (const update of updates || []) {
        offset = update.update_id + 1;
        if (!update.message) continue;
        try { await handle(update.message); }
        catch (e) { console.error("[TELEGRAM_FILES] update failed:", e instanceof Error ? e.message : e); }
      }
    } catch (e) {
      if (running) {
        console.error("[TELEGRAM_FILES] polling failed:", e instanceof Error ? e.message : e);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
}
export function startTelegramFilesBot(): void {
  if (!token()) { console.info("[TELEGRAM_FILES] disabled: token not configured"); return; }
  if (running) return;
  running = true;
  console.info("[TELEGRAM_FILES] bot polling started");
  task = loop().finally(() => { running = false; task = null; });
}
export async function stopTelegramFilesBot(): Promise<void> { running = false; await task; }

export async function getTelegramFileStream(fileId: string, range?: string): Promise<{ response: Response; fileName: string }> {
  const info = await api<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!info.file_path) throw new Error("Telegram did not return a file path");
  const response = await fetch(`https://api.telegram.org/file/bot${token()}/${info.file_path}`, {
    headers: range ? { Range: range } : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if ((!response.ok && response.status !== 206) || !response.body) throw new Error("Could not download file from Telegram");
  return { response, fileName: info.file_path.split("/").pop() || "file.bin" };
}

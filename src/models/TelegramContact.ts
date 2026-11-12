import mongoose, { type InferSchemaType } from "mongoose";

const { Schema, model } = mongoose;
/**
 * هر کسی که ربات را Start کند اینجا ذخیره می‌شود.
 * ربات تلگرام نمی‌تواند با @username به کسی پیام بدهد؛ فقط با chat id.
 * پس برای ارسال کد به @username، اول chat id را از همین جدول پیدا می‌کنیم.
 */
const telegramContactSchema = new Schema(
  {
    chatId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    username: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },

    firstName: {
      type: String,
      trim: true,
    },

    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type TelegramContactDocument = InferSchemaType<typeof telegramContactSchema>;

export const TelegramContact = model<TelegramContactDocument>(
  "TelegramContact",
  telegramContactSchema,
);
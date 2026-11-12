import mongoose, { type InferSchemaType } from "mongoose";

const { Schema, model } = mongoose;

const registrationDataSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    telegramChatId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false },
);

const otpSchema = new Schema(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
    },

    telegramChatId: {
      type: String,
      required: true,
      trim: true,
    },

    codeHash: {
      type: String,
      required: true,
      select: false,
    },

    purpose: {
      type: String,
      enum: ["register", "reset_password"],
      required: true,
    },

    registrationData: {
      type: registrationDataSchema,
      required: false,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxAttempts: {
      type: Number,
      default: 5,
    },

    // زمان صدور کد؛ برای فاصله‌ی بین دو درخواست و محدودیت تعداد در ساعت.
    issuedAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },

    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

otpSchema.index({ phone: 1, purpose: 1, issuedAt: -1 });
otpSchema.index({ telegramChatId: 1, issuedAt: -1 });

export type OtpDocument = InferSchemaType<typeof otpSchema>;

export const Otp = model<OtpDocument>("Otp", otpSchema);
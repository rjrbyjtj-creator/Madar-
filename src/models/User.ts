import mongoose, { type InferSchemaType } from "mongoose";

const { Schema, model } = mongoose;
const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    telegramChatId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    telegramUsername: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },

    schoolName: { type: String, trim: true, maxlength: 160 },

    officialSchoolName: { type: String, trim: true, maxlength: 200 },

    grade: { type: String, trim: true, maxlength: 40 },

    fieldOfStudy: { type: String, trim: true, maxlength: 80 },

    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      default: "student",
    },

    isEmailVerified: { type: Boolean, default: false },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    isTelegramVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // با تغییر رمز، همه‌ی توکن‌های قبلی بی‌اعتبار می‌شوند.
    passwordChangedAt: {
      type: Date,
    },

    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User = model<UserDocument>("User", userSchema);
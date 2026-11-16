import mongoose from "mongoose";
const { Schema, model } = mongoose;
const registrationOtpSchema = new Schema({
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  channel: { type: String, enum: ["telegram", "email"], required: true },
  destination: { type: String, required: true, trim: true },
  chatId: { type: String, trim: true },
  codeHash: { type: String, required: true, select: false },
  registrationData: { type: Schema.Types.Mixed, required: true, select: false },
  attempts: { type: Number, default: 0 },
  issuedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
registrationOtpSchema.index({ phone: 1, consumedAt: 1, issuedAt: -1 });
export const RegistrationOtp = model("RegistrationOtp", registrationOtpSchema);

import mongoose, { type InferSchemaType } from "mongoose";

const { Schema, model } = mongoose;

const passwordResetChallengeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  channel: { type: String, enum: ["email", "telegram"], required: true },
  codeHash: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0, min: 0 },
  issuedAt: { type: Date, default: Date.now },
  codeExpiresAt: { type: Date, required: true },
  verifiedAt: { type: Date, default: null },
  resetTokenHash: { type: String, default: null, select: false },
  resetTokenExpiresAt: { type: Date, default: null },
  consumedAt: { type: Date, default: null },
  cleanupAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true, versionKey: false });

passwordResetChallengeSchema.index({ userId: 1, channel: 1, issuedAt: -1 });

export type PasswordResetChallengeDocument = InferSchemaType<typeof passwordResetChallengeSchema>;
export const PasswordResetChallenge = model<PasswordResetChallengeDocument>(
  "PasswordResetChallenge",
  passwordResetChallengeSchema,
);

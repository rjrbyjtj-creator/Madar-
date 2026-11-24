import mongoose from "mongoose";

const { Schema, model } = mongoose;

const aiJobSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversation: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      index: true,
    },
    progress: { type: String, trim: true, maxlength: 200, default: "در صف ساخت آزمون" },
    payload: { type: Schema.Types.Mixed, required: true },
    lockedAt: { type: Date, default: null },
    lockToken: { type: String, maxlength: 64, default: null },
    attempts: { type: Number, min: 0, default: 0 },
    result: { type: Schema.Types.Mixed, default: undefined },
    error: { type: String, trim: true, maxlength: 1200, default: "" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

aiJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
aiJobSchema.index({ user: 1, createdAt: -1 });
aiJobSchema.index({ status: 1, lockedAt: 1, createdAt: 1 });

export const AIJob = model("AIJob", aiJobSchema);

export async function ensureAIJobIndexes(): Promise<void> {
  const indexes = await AIJob.collection.indexes();
  const expiryIndex = indexes.find((index) => index.key?.expiresAt === 1);
  if (expiryIndex?.name && expiryIndex.expireAfterSeconds === undefined) {
    await AIJob.collection.dropIndex(expiryIndex.name);
  }
  await AIJob.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

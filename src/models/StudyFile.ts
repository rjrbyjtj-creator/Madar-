import mongoose, { type InferSchemaType } from "mongoose";

const studyFileSchema = new mongoose.Schema({
  telegramFileId: { type: String, required: true, unique: true, index: true },
  telegramFileUniqueId: { type: String, required: true, index: true },
  fileName: { type: String, required: true, trim: true, maxlength: 240 },
  mimeType: { type: String, default: "application/pdf" },
  fileSize: { type: Number, required: true, min: 1 },
  caption: { type: String, default: "", maxlength: 1000 },
  uploadedByChatId: { type: String, required: true, index: true },
  uploadedByName: { type: String, default: "" },
  telegramMessageId: { type: Number },
  telegramFilePath: { type: String, default: "" },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true, versionKey: false });

studyFileSchema.index({ createdAt: -1 });
export type StudyFileDocument = InferSchemaType<typeof studyFileSchema>;
export const StudyFile = mongoose.model<StudyFileDocument>("StudyFile", studyFileSchema);

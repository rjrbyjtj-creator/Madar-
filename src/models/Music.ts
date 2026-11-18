import mongoose from "mongoose";
const { Schema, model } = mongoose;

const musicSchema = new Schema({
  telegramFileId: { type: String, required: true },
  telegramFileUniqueId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  artist: { type: String, default: "نامشخص", trim: true, maxlength: 120 },
  album: { type: String, default: "", trim: true, maxlength: 120 },
  category: { type: String, default: "عمومی", trim: true, maxlength: 60, index: true },
  duration: { type: Number, required: true, min: 1 },
  fileName: { type: String, required: true, trim: true, maxlength: 240 },
  mimeType: { type: String, default: "audio/mpeg", trim: true, maxlength: 100 },
  fileSize: { type: Number, required: true, min: 1 },
  caption: { type: String, default: "", maxlength: 1000 },
  uploadedByChatId: { type: String, required: true, index: true },
  uploadedByName: { type: String, default: "" },
  telegramMessageId: { type: Number },
  isActive: { type: Boolean, default: true, index: true },
  playCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });

musicSchema.index({ isActive: 1, createdAt: -1 });
musicSchema.index({ isActive: 1, category: 1, createdAt: -1 });

export const Music = model("Music", musicSchema);

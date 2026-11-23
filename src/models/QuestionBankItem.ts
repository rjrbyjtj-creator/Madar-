import mongoose, { type InferSchemaType } from "mongoose";

const questionBankItemSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true, maxlength: 5000 },
  subject: { type: String, required: true, trim: true, maxlength: 80, index: true },
  grade: { type: String, default: "", trim: true, maxlength: 40, index: true },
  chapter: { type: String, default: "", trim: true, maxlength: 120, index: true },
  questionType: { type: String, default: "ترکیبی", trim: true, maxlength: 60 },
  difficulty: { type: String, enum: ["آسان", "متوسط", "سخت", "ترکیبی"], default: "متوسط" },
  source: { type: String, default: "", trim: true, maxlength: 180 },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true, versionKey: false });

questionBankItemSchema.index({ subject: 1, grade: 1, chapter: 1, isActive: 1, createdAt: -1 });
export type QuestionBankItemDocument = InferSchemaType<typeof questionBankItemSchema>;
export const QuestionBankItem = mongoose.model<QuestionBankItemDocument>("QuestionBankItem", questionBankItemSchema);

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const examSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: "", trim: true, maxlength: 2000 },
  subject: { type: String, default: "", trim: true, maxlength: 80 },
  grade: { type: String, default: "", trim: true, maxlength: 40 },
  status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
  scheduledAt: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, required: true, min: 1, max: 600, default: 90 },
  questionCount: { type: Number, required: true, min: 1, max: 1000, default: 20 },
  totalScore: { type: Number, min: 1, max: 10000, default: 100 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  publishedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

examSchema.index({ status: 1, scheduledAt: 1 });
export const Exam = mongoose.models.Exam || model("Exam", examSchema);

import mongoose from "mongoose";
const { Schema, model } = mongoose;
const planTaskSchema = new Schema({
  id: { type: String, required: true, trim: true, maxlength: 64 },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, enum: ["study", "video", "test", "note"], default: "study" },
  start: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  end: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  done: { type: Boolean, default: false },
}, { _id: false });
const planSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  tasks: { type: [planTaskSchema], default: [] },
  note: { type: String, default: "", maxlength: 4000 },
}, { timestamps: true, versionKey: false });
planSchema.index({ user: 1, date: 1 }, { unique: true });
export const Plan = model("Plan", planSchema);

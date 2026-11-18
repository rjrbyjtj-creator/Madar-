import mongoose from "mongoose";
const { Schema, model } = mongoose;

const gradeSchema = new Schema({
  id: { type: String, required: true, trim: true, maxlength: 64 },
  subject: { type: String, required: true, trim: true, maxlength: 60 },
  source: { type: String, enum: ["school", "maz", "ghalamchi"], required: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  date: { type: String, default: "", match: /^(\\d{4}-\\d{2}-\\d{2})?$/ },
}, { _id: false });

const testSchema = new Schema({
  id: { type: String, required: true, trim: true, maxlength: 64 },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  provider: { type: String, enum: ["maz", "ghalamchi", "school", "other"], default: "maz" },
  date: { type: String, required: true, match: /^\\d{4}-\\d{2}-\\d{2}$/ },
  totalScore: { type: Number, min: 0, max: 10000, default: null },
  regionScore: { type: Number, min: 0, max: 10000, default: null },
}, { _id: false });

const noteSchema = new Schema({
  id: { type: String, required: true, trim: true, maxlength: 64 },
  date: { type: String, required: true, match: /^\\d{4}-\\d{2}-\\d{2}$/ },
  subject: { type: String, trim: true, maxlength: 60, default: "عمومی" },
  color: { type: String, enum: ["blue", "green", "peach"], default: "blue" },
  text: { type: String, required: true, trim: true, maxlength: 1500 },
}, { _id: false });

const performanceSchema = new Schema({
  id: { type: String, required: true, trim: true, maxlength: 64 },
  subject: { type: String, required: true, trim: true, maxlength: 60 },
  mastery: { type: Number, required: true, min: 0, max: 100 },
}, { _id: false });

const solvedSchema = new Schema({
  id: { type: String, required: true, trim: true, maxlength: 64 },
  label: { type: String, required: true, trim: true, maxlength: 80 },
  count: { type: Number, required: true, min: 0, max: 10000000 },
}, { _id: false });

const examSchema = new Schema({
  id: { type: String, required: true, trim: true, maxlength: 64 },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  date: { type: String, required: true, match: /^\\d{4}-\\d{2}-\\d{2}$/ },
  provider: { type: String, enum: ["maz", "ghalamchi", "school", "other"], default: "school" },
}, { _id: false });

const historySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  grades: { type: [gradeSchema], default: [] },
  tests: { type: [testSchema], default: [] },
  notes: { type: [noteSchema], default: [] },
  performance: { type: [performanceSchema], default: [] },
  solved: { type: [solvedSchema], default: [] },
  exams: { type: [examSchema], default: [] },
}, { timestamps: true, versionKey: false });

export const StudentAcademicHistory = model("StudentAcademicHistory", historySchema);

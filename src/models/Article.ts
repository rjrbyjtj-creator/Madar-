import mongoose from "mongoose";
const { Schema, model } = mongoose;

const articleSchema = new Schema({
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 100, match: /^[a-z0-9-]+$/ },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  excerpt: { type: String, required: true, trim: true, maxlength: 500 },
  category: { type: String, default: "آموزش و یادگیری", trim: true, maxlength: 80 },
  readTime: { type: Number, default: 5, min: 1, max: 120 },
  coverImage: { type: String, default: "", trim: true, maxlength: 600 },
  url: { type: String, required: true, trim: true, maxlength: 600 },
  published: { type: Boolean, default: false, index: true },
  featured: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  publishedAt: { type: Date, default: Date.now },
}, { timestamps: true, versionKey: false });

articleSchema.index({ published: 1, order: 1, publishedAt: -1 });
export const Article = model("Article", articleSchema);

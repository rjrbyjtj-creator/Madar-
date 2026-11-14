import mongoose, { type Document, type Model } from "mongoose";

const { Schema, model } = mongoose;

export type ThemeColors = {
  navy: string;
  gold: string;
  bg: string;
  green: string;
  text?: string;
  muted?: string;
  surface?: string;
  line?: string;
};

export interface ThemeDocument extends Document {
  name: string;
  slug: string;
  colors: ThemeColors;
  font: "vazir" | "tahoma" | "system";
  mode: "light" | "dark";
  isActive: boolean;
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const colorsSchema = new Schema(
  {
    navy: { type: String, required: true, trim: true },
    gold: { type: String, required: true, trim: true },
    bg: { type: String, required: true, trim: true },
    green: { type: String, required: true, trim: true },
    text: { type: String, trim: true, default: "#1e293b" },
    muted: { type: String, trim: true, default: "#64748b" },
    surface: { type: String, trim: true, default: "#ffffff" },
    line: { type: String, trim: true, default: "#e3e8f0" },
  },
  { _id: false },
);

const themeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 40,
    },
    colors: {
      type: colorsSchema,
      required: true,
    },
    font: {
      type: String,
      enum: ["vazir", "tahoma", "system"],
      default: "vazir",
    },
    mode: {
      type: String,
      enum: ["light", "dark"],
      default: "light",
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const Theme: Model<ThemeDocument> = model<ThemeDocument>("Theme", themeSchema);

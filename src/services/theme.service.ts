import { Theme, type ThemeDocument } from "../models/Theme.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

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

export type PublicTheme = {
  id: string;
  name: string;
  slug: string;
  colors: ThemeColors;
  font: string;
  mode: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const FONT_CSS: Record<string, string> = {
  vazir: "'Vazirmatn',Tahoma,sans-serif",
  tahoma: "Tahoma,sans-serif",
  system: "system-ui,-apple-system,sans-serif",
};

const DEFAULT_THEMES: Array<{
  name: string;
  slug: string;
  colors: ThemeColors;
  font: string;
  mode: "light" | "dark";
  isActive?: boolean;
  isDefault?: boolean;
}> = [
  {
    name: "مدار (پیش‌فرض)",
    slug: "madar",
    colors: {
      navy: "#1c2b4b",
      gold: "#d4b16a",
      bg: "#f5f7fb",
      green: "#22c55e",
      text: "#1e293b",
      muted: "#64748b",
      surface: "#ffffff",
      line: "#e3e8f0",
    },
    font: "vazir",
    mode: "light",
    isActive: true,
    isDefault: true,
  },
  {
    name: "اقیانوس",
    slug: "ocean",
    colors: {
      navy: "#0f4c81",
      gold: "#38bdf8",
      bg: "#f0f9ff",
      green: "#10b981",
      text: "#0c4a6e",
      muted: "#64748b",
      surface: "#ffffff",
      line: "#e0f2fe",
    },
    font: "vazir",
    mode: "light",
  },
  {
    name: "جنگل",
    slug: "forest",
    colors: {
      navy: "#14532d",
      gold: "#84cc16",
      bg: "#f7fee7",
      green: "#f59e0b",
      text: "#14532d",
      muted: "#4d7c0f",
      surface: "#ffffff",
      line: "#ecfccb",
    },
    font: "vazir",
    mode: "light",
  },
  {
    name: "بنفش سلطنتی",
    slug: "royal",
    colors: {
      navy: "#4c1d95",
      gold: "#c4b5fd",
      bg: "#f5f3ff",
      green: "#ec4899",
      text: "#4c1d95",
      muted: "#6b7280",
      surface: "#ffffff",
      line: "#ede9fe",
    },
    font: "vazir",
    mode: "light",
  },
];

export function toPublicTheme(doc: ThemeDocument | Record<string, unknown>): PublicTheme {
  const d = doc as ThemeDocument;
  return {
    id: String(d._id),
    name: d.name,
    slug: d.slug,
    colors: d.colors as ThemeColors,
    font: d.font,
    mode: d.mode,
    isActive: Boolean(d.isActive),
    isDefault: Boolean(d.isDefault),
    createdAt: (d as { createdAt?: Date }).createdAt ?? null,
    updatedAt: (d as { updatedAt?: Date }).updatedAt ?? null,
  };
}

export function fontCss(font: string): string {
  return FONT_CSS[font] ?? FONT_CSS.vazir;
}

export async function seedDefaultThemes(): Promise<void> {
  try {
    const count = await Theme.countDocuments();
    if (count > 0) {
      logger.info({ count }, "Themes already exist — skip seed");
      return;
    }
    await Theme.insertMany(
      DEFAULT_THEMES.map((t) => ({
        ...t,
        isActive: Boolean(t.isActive),
        isDefault: Boolean(t.isDefault),
      })),
    );
    logger.info({ n: DEFAULT_THEMES.length }, "Default themes seeded");
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : error },
      "Failed to seed themes",
    );
  }
}

export async function getActiveTheme(): Promise<PublicTheme> {
  let theme = await Theme.findOne({ isActive: true }).lean();
  if (!theme) {
    theme = await Theme.findOne({ isDefault: true }).lean();
  }
  if (!theme) {
    theme = await Theme.findOne().lean();
  }
  if (!theme) {
    const d = DEFAULT_THEMES[0];
    return {
      id: "fallback",
      name: d.name,
      slug: d.slug,
      colors: d.colors,
      font: d.font,
      mode: d.mode,
      isActive: true,
      isDefault: true,
      createdAt: null,
      updatedAt: null,
    };
  }
  return toPublicTheme(theme as unknown as ThemeDocument);
}

export async function listThemes(): Promise<PublicTheme[]> {
  const rows = await Theme.find().sort({ isDefault: -1, createdAt: 1 }).lean();
  return rows.map((r) => toPublicTheme(r as unknown as ThemeDocument));
}

export async function createTheme(input: {
  name: string;
  slug?: string;
  colors: ThemeColors;
  font?: string;
  mode?: "light" | "dark";
}): Promise<PublicTheme> {
  const baseSlug = (input.slug || input.name)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const slug = baseSlug || `theme-${Date.now()}`;

  const exists = await Theme.exists({ slug });
  if (exists) {
    throw new AppError(409, "SLUG_TAKEN", "این شناسه تم قبلاً ثبت شده.");
  }

  const doc = await Theme.create({
    name: input.name.trim(),
    slug,
    colors: input.colors,
    font: input.font ?? "vazir",
    mode: input.mode ?? "light",
    isActive: false,
    isDefault: false,
  });

  return toPublicTheme(doc);
}

export async function updateTheme(
  id: string,
  input: Partial<{
    name: string;
    colors: ThemeColors;
    font: string;
    mode: "light" | "dark";
  }>,
): Promise<PublicTheme> {
  const doc = await Theme.findById(id);
  if (!doc) throw new AppError(404, "NOT_FOUND", "تم پیدا نشد.");

  if (input.name) doc.name = input.name.trim();
  if (input.colors) doc.colors = { ...doc.colors, ...input.colors } as ThemeDocument["colors"];
  if (input.font) doc.font = input.font as ThemeDocument["font"];
  if (input.mode) doc.mode = input.mode as ThemeDocument["mode"];
  await doc.save();
  return toPublicTheme(doc);
}

export async function activateTheme(id: string): Promise<PublicTheme> {
  const doc = await Theme.findById(id);
  if (!doc) throw new AppError(404, "NOT_FOUND", "تم پیدا نشد.");

  await Theme.updateMany({ isActive: true }, { $set: { isActive: false } });
  doc.isActive = true;
  await doc.save();
  return toPublicTheme(doc);
}

export async function deleteTheme(id: string): Promise<void> {
  const doc = await Theme.findById(id);
  if (!doc) throw new AppError(404, "NOT_FOUND", "تم پیدا نشد.");
  if (doc.isDefault) {
    throw new AppError(400, "DEFAULT_THEME", "تم پیش‌فرض قابل حذف نیست.");
  }
  if (doc.isActive) {
    throw new AppError(400, "ACTIVE_THEME", "اول تم دیگری را فعال کن، بعد این را حذف کن.");
  }
  await doc.deleteOne();
}

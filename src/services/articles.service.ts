import { Article } from "../models/Article.js";
import { logger } from "../utils/logger.js";

const DEFAULT_ARTICLE = {
  title: "بهترین روش مطالعه حسابان یازدهم",
  excerpt: "درس حسابان یکی از مهم‌ترین دروس رشته ریاضی است. در این مقاله روش‌های مطالعه، برنامه‌ریزی و نکات کلیدی برای موفقیت در امتحانات و کنکور را بررسی می‌کنیم.",
  category: "ریاضی و یادگیری",
  readTime: 5,
  coverImage: "https://rjrbyjtj-creator.github.io/Madar-F/عکس%20ها/2.png",
  url: "https://rjrbyjtj-creator.github.io/Madar-F/articles/hesaban-11/index.html",
  published: true,
  featured: true,
  order: 1,
};
const DEFAULT_ARTICLE_METADATA_VERSION = 2;

/** مقاله حسابان یازدهم را ایجاد می‌کند و فراداده قدیمی را فقط یک‌بار مهاجرت می‌دهد. */
export async function seedDefaultArticles(): Promise<void> {
  try {
    await Article.updateOne(
      { slug: "hesaban-11" },
      {
        $setOnInsert: {
          slug: "hesaban-11",
          ...DEFAULT_ARTICLE,
          metadataVersion: DEFAULT_ARTICLE_METADATA_VERSION,
          publishedAt: new Date("2026-11-14T00:00:00.000Z"),
        },
      },
      { upsert: true },
    );

    // رکوردهای ساخته‌شده با نسخه قدیمی seed، یک‌بار به فراداده صحیح منتقل می‌شوند.
    // پس از مهاجرت، ویرایش‌های بعدی مدیر در راه‌اندازی‌های بعدی بازنویسی نمی‌شوند.
    await Article.updateOne(
      {
        slug: "hesaban-11",
        $or: [
          { metadataVersion: { $exists: false } },
          { metadataVersion: { $lt: DEFAULT_ARTICLE_METADATA_VERSION } },
        ],
      },
      {
        $set: {
          ...DEFAULT_ARTICLE,
          metadataVersion: DEFAULT_ARTICLE_METADATA_VERSION,
        },
      },
    );

    logger.info("Default article metadata migration ensured");
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : error }, "Failed to ensure default article");
  }
}

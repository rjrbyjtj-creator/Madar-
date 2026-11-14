import { Article } from "../models/Article.js";
import { logger } from "../utils/logger.js";

/** مقاله حسابان یازدهم را با فراداده هماهنگ با محتوای منتشرشده تضمین می‌کند. */
export async function seedDefaultArticles(): Promise<void> {
  try {
    await Article.updateOne(
      { slug: "hesaban-11" },
      {
        // این فیلدها باید با عنوان، تصویر و زمان مطالعه مقاله واقعی هماهنگ بمانند؛
        // $setOnInsert به‌تنهایی اطلاعات قدیمی رکورد موجود را اصلاح نمی‌کند.
        $set: {
          title: "بهترین روش مطالعه حسابان یازدهم",
          excerpt: "درس حسابان یکی از مهم‌ترین دروس رشته ریاضی است. در این مقاله روش‌های مطالعه، برنامه‌ریزی و نکات کلیدی برای موفقیت در امتحانات و کنکور را بررسی می‌کنیم.",
          category: "ریاضی و یادگیری",
          readTime: 5,
          coverImage: "https://rjrbyjtj-creator.github.io/Madar-F/عکس%20ها/2.png",
          url: "https://rjrbyjtj-creator.github.io/Madar-F/articles/hesaban-11/index.html",
          published: true,
          featured: true,
          order: 1,
        },
        $setOnInsert: {
          slug: "hesaban-11",
          publishedAt: new Date("2026-11-14T00:00:00.000Z"),
        },
      },
      { upsert: true },
    );
    logger.info("Default article metadata synchronized");
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : error }, "Failed to seed default article");
  }
}

import { Article } from "../models/Article.js";
import { logger } from "../utils/logger.js";

/** مقاله نمونه حسابان یازدهم را بدون ساخت رکورد تکراری تضمین می‌کند. */
export async function seedDefaultArticles(): Promise<void> {
  try {
    await Article.updateOne(
      { slug: "hesaban-11" },
      {
        $setOnInsert: {
          slug: "hesaban-11",
          title: "بهترین روش مطالعه حسابان یازدهم",
          excerpt: "راهنمایی کاربردی برای یادگیری مفهومی حسابان یازدهم؛ از فهم درس و حل تمرین تا مرور هدفمند و آمادگی برای امتحان.",
          category: "ریاضی و یادگیری",
          readTime: 8,
          coverImage: "https://rjrbyjtj-creator.github.io/Madar-F/عکس%20ها/2.png",
          url: "./articles/hesaban-11/index.html",
          published: true,
          featured: true,
          order: 1,
          publishedAt: new Date("2026-11-14T00:00:00.000Z"),
        },
      },
      { upsert: true },
    );
    logger.info("Default articles ensured");
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : error }, "Failed to seed default articles");
  }
}

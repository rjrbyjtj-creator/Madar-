import mongoose from "mongoose";
import { z } from "zod";
import type { Request, Response } from "express";
import { Article } from "../models/Article.js";
import { AppError } from "../utils/errors.js";

const articleInput = z.object({
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(3).max(180),
  excerpt: z.string().trim().min(10).max(500),
  category: z.string().trim().min(2).max(80).default("آموزش و یادگیری"),
  readTime: z.number().int().min(1).max(120).default(5),
  coverImage: z.string().trim().max(600).default(""),
  url: z.string().trim().min(1).max(600),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  order: z.number().int().min(-1000).max(1000).default(0),
  publishedAt: z.coerce.date().optional(),
});
const articlePatch = articleInput.partial();

function idParam(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}
function validId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}
function publicArticle(article: Record<string, unknown>) {
  return {
    id: String(article._id),
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    category: article.category,
    readTime: article.readTime,
    coverImage: article.coverImage,
    url: article.url,
    featured: Boolean(article.featured),
    publishedAt: article.publishedAt,
  };
}

/** GET /api/articles — فهرست عمومی مقالات منتشرشده */
export async function listPublicArticles(_req: Request, res: Response): Promise<void> {
  const articles = await Article.find({ published: true })
    .select("slug title excerpt category readTime coverImage url featured publishedAt")
    .sort({ featured: -1, order: 1, publishedAt: -1 })
    .limit(48)
    .lean();
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ ok: true, articles: articles.map((item) => publicArticle(item as unknown as Record<string, unknown>)) });
}

/** GET /api/articles/manage — فقط مدیر */
export async function listManagedArticles(_req: Request, res: Response): Promise<void> {
  const articles = await Article.find().sort({ order: 1, updatedAt: -1 }).limit(200).lean();
  res.json({ ok: true, articles });
}

/** POST /api/articles — فقط مدیر */
export async function createArticle(req: Request, res: Response): Promise<void> {
  const parsed = articleInput.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "INVALID_ARTICLE", "اطلاعات مقاله معتبر نیست.");
  const exists = await Article.exists({ slug: parsed.data.slug });
  if (exists) throw new AppError(409, "ARTICLE_SLUG_EXISTS", "این شناسه مقاله قبلاً ثبت شده است.");
  const article = await Article.create(parsed.data);
  res.status(201).json({ ok: true, article });
}

/** PUT /api/articles/:id — فقط مدیر */
export async function updateArticle(req: Request, res: Response): Promise<void> {
  const id = idParam(req);
  if (!validId(id)) throw new AppError(400, "INVALID_ARTICLE_ID", "شناسه مقاله معتبر نیست.");
  const parsed = articlePatch.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) throw new AppError(400, "INVALID_ARTICLE", "اطلاعات مقاله معتبر نیست.");
  const updated = await Article.findByIdAndUpdate(id, { $set: parsed.data }, { new: true, runValidators: true }).lean();
  if (!updated) throw new AppError(404, "ARTICLE_NOT_FOUND", "مقاله پیدا نشد.");
  res.json({ ok: true, article: updated });
}

/** DELETE /api/articles/:id — فقط مدیر */
export async function deleteArticle(req: Request, res: Response): Promise<void> {
  const id = idParam(req);
  if (!validId(id)) throw new AppError(400, "INVALID_ARTICLE_ID", "شناسه مقاله معتبر نیست.");
  const deleted = await Article.findByIdAndDelete(id);
  if (!deleted) throw new AppError(404, "ARTICLE_NOT_FOUND", "مقاله پیدا نشد.");
  res.json({ ok: true });
}

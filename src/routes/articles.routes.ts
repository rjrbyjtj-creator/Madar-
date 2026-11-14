import { Router } from "express";
import {
  createArticle,
  deleteArticle,
  listManagedArticles,
  listPublicArticles,
  updateArticle,
} from "../controllers/articles.controller.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";

export const articlesRouter = Router();

// فهرست مقالات منتشرشده برای صفحه اصلی سایت، بدون نیاز به ورود
articlesRouter.get("/", listPublicArticles);

// مدیریت محتوا فقط برای مدیر سامانه
articlesRouter.get("/manage", requireAuth, requireAdmin, listManagedArticles);
articlesRouter.post("/", requireAuth, requireAdmin, createArticle);
articlesRouter.put("/:id", requireAuth, requireAdmin, updateArticle);
articlesRouter.delete("/:id", requireAuth, requireAdmin, deleteArticle);

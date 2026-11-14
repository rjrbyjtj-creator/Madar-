import { Router } from "express";
import {
  activate,
  create,
  getActive,
  list,
  remove,
  update,
} from "../controllers/theme.controller.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";

export const themeRouter = Router();

/** عمومی — تم فعال برای کل سایت */
themeRouter.get("/active", getActive);

/** فقط ادمین */
themeRouter.get("/", requireAuth, requireAdmin, list);
themeRouter.post("/", requireAuth, requireAdmin, create);
themeRouter.put("/:id", requireAuth, requireAdmin, update);
themeRouter.post("/:id/activate", requireAuth, requireAdmin, activate);
themeRouter.delete("/:id", requireAuth, requireAdmin, remove);

import { Router } from "express";
import { deactivateMusic, listMusic, streamMusic } from "../controllers/music.controller.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";
export const musicRouter = Router();
musicRouter.get("/", listMusic);
musicRouter.get("/:id/stream", streamMusic);
musicRouter.delete("/manage/:id", requireAuth, requireAdmin, deactivateMusic);

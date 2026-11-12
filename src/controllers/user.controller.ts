import type { Request, Response } from "express";
import { toPublicUser } from "../services/auth.service.js";

/** GET /api/users/me  (هدر Authorization: Bearer <token>) */
export function getMe(_req: Request, res: Response): void {
  res.json({ ok: true, user: toPublicUser(res.locals.user) });
}
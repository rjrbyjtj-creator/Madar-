import type { Request, Response } from "express";
import { physicsDiagramSchema, renderPhysicsDiagram } from "../services/physics-diagram.service.js";
import { AppError } from "../utils/errors.js";

export function renderPhysicsDiagramRequest(req: Request, res: Response): void {
  const parsed = physicsDiagramSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_PHYSICS_DIAGRAM", "ساختار شکل فیزیک معتبر نیست؛ نوع شکل و داده‌های آن را بررسی کن.");
  }
  try {
    const result = renderPhysicsDiagram(parsed.data);
    res.setHeader("Cache-Control", "private, no-store");
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "PHYSICS_DIAGRAM_RENDER_FAILED", error instanceof Error ? error.message : "ترسیم شکل فیزیک انجام نشد.");
  }
}

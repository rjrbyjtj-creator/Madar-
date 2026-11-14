import type { Request, Response } from "express";
import {
  activateTheme,
  createTheme,
  deleteTheme,
  getActiveTheme,
  listThemes,
  updateTheme,
} from "../services/theme.service.js";
import {
  parseCreateTheme,
  parseUpdateTheme,
} from "../validators/theme.validators.js";

function idParam(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
}

/** GET /api/themes/active — عمومی */
export async function getActive(_req: Request, res: Response): Promise<void> {
  const theme = await getActiveTheme();
  res.json({ ok: true, theme });
}

/** GET /api/themes — ادمین */
export async function list(_req: Request, res: Response): Promise<void> {
  const themes = await listThemes();
  res.json({ ok: true, themes });
}

/** POST /api/themes — ادمین */
export async function create(req: Request, res: Response): Promise<void> {
  const input = parseCreateTheme(req.body);
  const theme = await createTheme(input);
  res.status(201).json({ ok: true, theme });
}

/** PUT /api/themes/:id — ادمین */
export async function update(req: Request, res: Response): Promise<void> {
  const input = parseUpdateTheme(req.body);
  const theme = await updateTheme(idParam(req), input);
  res.json({ ok: true, theme });
}

/** POST /api/themes/:id/activate — ادمین */
export async function activate(req: Request, res: Response): Promise<void> {
  const theme = await activateTheme(idParam(req));
  res.json({ ok: true, theme });
}

/** DELETE /api/themes/:id — ادمین */
export async function remove(req: Request, res: Response): Promise<void> {
  await deleteTheme(idParam(req));
  res.json({ ok: true });
}

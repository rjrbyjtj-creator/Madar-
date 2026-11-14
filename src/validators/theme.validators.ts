import { z } from "zod";
import { parseBody } from "../utils/validate.js";

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "رنگ باید هگز معتبر باشد");

const colorsSchema = z.object({
  navy: hex,
  gold: hex,
  bg: hex,
  green: hex,
  text: hex.optional(),
  muted: hex.optional(),
  surface: hex.optional(),
  line: hex.optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "slug فقط حروف انگلیسی کوچک، عدد و خط تیره")
    .optional(),
  colors: colorsSchema,
  font: z.enum(["vazir", "tahoma", "system"]).optional(),
  mode: z.enum(["light", "dark"]).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  colors: colorsSchema.partial().optional(),
  font: z.enum(["vazir", "tahoma", "system"]).optional(),
  mode: z.enum(["light", "dark"]).optional(),
});

export function parseCreateTheme(body: unknown) {
  return parseBody(createSchema, body);
}

export function parseUpdateTheme(body: unknown) {
  return parseBody(updateSchema, body);
}

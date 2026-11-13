import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  CLIENT_URL: z.string().min(1).default("http://localhost:3000"),
  OTP_EXPIRES_MINUTES: z.coerce.number().int().min(1).max(30).default(3),
  OTP_RESEND_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  // Gemini credentials stay on the backend; an empty key disables AI without stopping auth/API.
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration (.env):");
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const data = parsed.data;

export const env = {
  ...data,
  isProduction: data.NODE_ENV === "production",
  clientOrigins: data.CLIENT_URL.split(",")
    .map((origin) => origin.trim().replace(/\\/+$/, ""))
    .filter(Boolean),
};

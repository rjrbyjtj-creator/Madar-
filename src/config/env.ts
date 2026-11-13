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
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  GEMINI_TTS_MODEL: z.string().min(1).default("gemini-3.1-flash-tts-preview"),
  GEMINI_LIVE_MODEL: z.string().min(1).default("gemini-3.8-live"),
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

// Normalize retired Flash model IDs that may still be set in hosting environment variables.
const configuredGeminiModel = data.GEMINI_MODEL.trim();
const GEMINI_MODEL = ["gemini-2.5-flash", "gemini-3.6-flash"].includes(configuredGeminiModel)
  ? "gemini-3.8-flash"
  : configuredGeminiModel;
export const env = {
  ...data,
  GEMINI_MODEL,
  isProduction: data.NODE_ENV === "production",
  clientOrigins: data.CLIENT_URL.split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
};

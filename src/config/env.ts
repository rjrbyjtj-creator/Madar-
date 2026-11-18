import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1),
  TURSO_DATABASE_URL: z.string().default(""),
  TURSO_AUTH_TOKEN: z.string().default(""),
  JWT_SECRET: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_FILES_BOT_TOKEN: z.string().default(""),
  GOOGLE_APPS_SCRIPT_URL: z.string().url().or(z.literal("")).default(""),
  GOOGLE_APPS_SCRIPT_SECRET: z.string().default(""),
  CLIENT_URL: z.string().min(1).default("http://localhost:3000"),
  OTP_EXPIRES_MINUTES: z.coerce.number().int().min(1).max(30).default(3),
  OTP_RESEND_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
  BACKEND_ROLE: z.enum(["render", "railway"]).default("render"),
  PEER_BACKEND_URL: z.string().url().or(z.literal("")).default(""),
  LOAD_BALANCER_ENABLED: z.string().default("false").transform((value) => value.toLowerCase() === "true" || value === "1"),
  GEMINI_API_KEY: z.string().default(""),
  GROQ_API_KEY: z.string().default(""),
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  OPENROUTER_API_KEY: z.string().default(""),
  HF_TOKEN: z.string().default(""),
  CLOUDFLARE_API_TOKEN: z.string().default(""),
  CLOUDFLARE_ACCOUNT_ID: z.string().default(""),
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
    .map((origin) => { let value = origin.trim(); while (value.endsWith("/")) value = value.slice(0, -1); return value; })
    .filter(Boolean),
};

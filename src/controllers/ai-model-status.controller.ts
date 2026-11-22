import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { GEMINI_MODEL_IDS } from "../services/gemini.service.js";
import { GROQ_MODEL_IDS } from "../services/groq.service.js";
import { OPENROUTER_MODEL_IDS } from "../services/openrouter.service.js";
import { CLOUDFLARE_MODEL_IDS } from "../services/cloudflare.service.js";
import { HUGGINGFACE_MODEL_IDS } from "../services/huggingface.service.js";

type Quota = { label: string; limit?: number | null; remaining?: number | null; used?: number | null; reset?: string | null };
type ProviderStatus = { id: string; name: string; configured: boolean; status: "online" | "offline" | "unconfigured" | "unknown"; message: string; checkedAt: string; quota: Quota[]; models: Array<{ id: string; status: string }> };

function numeric(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function quotaHeaders(headers: Headers): Quota[] {
  const requestsLimit = numeric(headers.get("x-ratelimit-limit-requests"));
  const requestsRemaining = numeric(headers.get("x-ratelimit-remaining-requests"));
  const tokensLimit = numeric(headers.get("x-ratelimit-limit-tokens"));
  const tokensRemaining = numeric(headers.get("x-ratelimit-remaining-tokens"));
  const result: Quota[] = [];
  if (requestsLimit !== null || requestsRemaining !== null) result.push({ label: "درخواست‌ها", limit: requestsLimit, remaining: requestsRemaining, used: requestsLimit !== null && requestsRemaining !== null ? Math.max(0, requestsLimit - requestsRemaining) : null, reset: headers.get("x-ratelimit-reset-requests") });
  if (tokensLimit !== null || tokensRemaining !== null) result.push({ label: "توکن‌ها", limit: tokensLimit, remaining: tokensRemaining, used: tokensLimit !== null && tokensRemaining !== null ? Math.max(0, tokensLimit - tokensRemaining) : null, reset: headers.get("x-ratelimit-reset-tokens") });
  return result;
}
async function probe(url: string, headers: Record<string, string> = {}): Promise<{ response: Awaited<ReturnType<typeof fetch>>; body: any }> {
  const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(8000) });
  let body: any = null;
  try { body = await response.json(); } catch { /* provider may return no JSON body */ }
  return { response, body };
}
function modelRows(ids: readonly string[], status: string) {
  return ids.map((id) => ({ id, status }));
}
async function inspectProvider(input: {
  id: string; name: string; configured: boolean; models: readonly string[];
  check: () => Promise<{ response: Awaited<ReturnType<typeof fetch>>; body: any; quota?: Quota[]; message?: string }>;
}): Promise<ProviderStatus> {
  const checkedAt = new Date().toISOString();
  if (!input.configured) return { id: input.id, name: input.name, configured: false, status: "unconfigured", message: "کلید یا اطلاعات اتصال روی سرور تنظیم نشده است.", checkedAt, quota: [], models: modelRows(input.models, "unconfigured") };
  try {
    const { response, quota = [], message } = await input.check();
    const status = response.ok ? "online" : "offline";
    const label = response.ok ? (message ?? "اتصال برقرار است.") : response.status === 401 || response.status === 403 ? "کلید نامعتبر یا فاقد دسترسی است." : response.status === 429 ? "محدودیت درخواست یا سهمیه فعال شده است." : "سرویس پاسخ موفق نداد (HTTP " + response.status + ").";
    return { id: input.id, name: input.name, configured: true, status, message: label, checkedAt, quota, models: modelRows(input.models, status) };
  } catch (error) {
    const message = error instanceof Error && /timeout/i.test(error.message) ? "مهلت بررسی اتصال تمام شد." : "بررسی اتصال ناموفق بود.";
    return { id: input.id, name: input.name, configured: true, status: "unknown", message, checkedAt, quota: [], models: modelRows(input.models, "unknown") };
  }
}

export async function getAIModelStatus(_req: Request, res: Response): Promise<void> {
  const checks = await Promise.all([
    inspectProvider({ id: "gemini", name: "Google Gemini", configured: Boolean(env.GEMINI_API_KEY), models: GEMINI_MODEL_IDS, check: async () => {
      const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
      url.searchParams.set("pageSize", "1"); url.searchParams.set("key", env.GEMINI_API_KEY);
      const result = await probe(url.toString());
      return { ...result, quota: quotaHeaders(result.response.headers) };
    }}),
    inspectProvider({ id: "groq", name: "Groq", configured: Boolean(env.GROQ_API_KEY), models: GROQ_MODEL_IDS, check: async () => {
      const result = await probe("https://api.groq.com/openai/v1/models", { Authorization: "Bearer " + env.GROQ_API_KEY });
      return { ...result, quota: quotaHeaders(result.response.headers) };
    }}),
    inspectProvider({ id: "openrouter", name: "OpenRouter", configured: Boolean(env.OPENROUTER_API_KEY), models: OPENROUTER_MODEL_IDS, check: async () => {
      const result = await probe("https://openrouter.ai/api/v1/key", { Authorization: "Bearer " + env.OPENROUTER_API_KEY });
      const data = result.body?.data ?? result.body ?? {};
      const limit = numeric(data.limit);
      const remaining = numeric(data.limit_remaining);
      const quota: Quota[] = [];
      if (limit !== null || remaining !== null || numeric(data.usage) !== null) quota.push({ label: "اعتبار حساب", limit, remaining, used: numeric(data.usage), reset: data.is_free_tier ? "طرح رایگان" : null });
      return { ...result, quota };
    }}),
    inspectProvider({ id: "cloudflare", name: "Cloudflare Workers AI", configured: Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID), models: CLOUDFLARE_MODEL_IDS, check: async () => probe("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID) + "/ai/models/search?per_page=1", { Authorization: "Bearer " + env.CLOUDFLARE_API_TOKEN }) }),
    inspectProvider({ id: "huggingface", name: "Hugging Face", configured: Boolean(env.HF_TOKEN), models: HUGGINGFACE_MODEL_IDS, check: async () => probe("https://huggingface.co/api/whoami-v2", { Authorization: "Bearer " + env.HF_TOKEN }) }),
  ]);
  res.setHeader("Cache-Control", "no-store");
  res.json({ success: true, checkedAt: new Date().toISOString(), providers: checks, note: "سهمیه فقط وقتی نمایش داده می‌شود که خود ارائه‌دهنده آن را از API اعلام کند. وضعیت اتصال به معنی تضمین ظرفیت یا سهمیه مدل در زمان تولید پاسخ نیست." });
}

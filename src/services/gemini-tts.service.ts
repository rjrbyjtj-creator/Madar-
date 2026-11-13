import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

type GeminiTtsResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
  error?: { message?: string };
};

function pcmToWav(pcmData: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

export async function generateGeminiSpeech(text: string): Promise<Buffer> {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(503, "AI_NOT_CONFIGURED", "سرویس صدای هوش مصنوعی روی سرور تنظیم نشده است.");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `با صدایی طبیعی، شمرده و دوستانه به زبان فارسی بخوان: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const data = await response.json().catch(() => null) as GeminiTtsResponse | null;
  if (!response.ok) {
    console.warn("[AI TTS] Provider error:", response.status, (data?.error?.message ?? "").slice(0, 300));
    if (response.status === 429) {
      throw new AppError(429, "TTS_RATE_LIMITED", "ظرفیت تولید صدا موقتاً پر شده است. کمی بعد دوباره تلاش کن.");
    }
    throw new AppError(502, "TTS_PROVIDER_ERROR", "تولید صدای پاسخ با خطا روبه‌رو شد.");
  }

  const audioData = data?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;
  if (!audioData) {
    throw new AppError(502, "TTS_EMPTY_AUDIO", "صدایی از Gemini دریافت نشد.");
  }

  return pcmToWav(Buffer.from(audioData, "base64"));
}

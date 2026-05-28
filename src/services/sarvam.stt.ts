import { config } from "../config.js";

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";

export type VoiceIntent = "taken" | "later" | "skipped" | "unclear";

const INTENT_PATTERNS: Record<VoiceIntent, RegExp[]> = {
  taken: [
    /\b(taken|take|had|done|le\s*li|liya|li|खा\s*ली|खाली|சாப்பிட|తీసుకున్న|নিয়েছি)\b/i,
  ],
  later: [
    /\b(later|soon|will\s*take|baad|बाद|थोड़ी|பிறகு|తర్వాత|পরে)\b/i,
  ],
  skipped: [
    /\b(skip|skipped|not\s*now|nahi|नहीं|வேண்டாம்|వద్దు|না)\b/i,
  ],
  unclear: [],
};

export function mapTranscriptToIntent(transcript: string): VoiceIntent {
  const t = transcript.trim().toLowerCase();
  if (!t) return "unclear";
  for (const intent of ["taken", "later", "skipped"] as VoiceIntent[]) {
    if (INTENT_PATTERNS[intent].some((re) => re.test(t))) return intent;
  }
  return "unclear";
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  languageCode: string,
  filename = "voice.ogg"
): Promise<string | null> {
  if (!config.SARVAM_API_KEY) return null;

  const form = new FormData();
  form.append("file", new Blob([audioBuffer]), filename);
  form.append("model", "saaras:v3");
  form.append("language_code", languageCode === "unknown" ? "unknown" : languageCode);

  const res = await fetch(SARVAM_STT_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": config.SARVAM_API_KEY,
    },
    body: form,
  });

  if (!res.ok) {
    console.error("Sarvam STT error:", res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { transcript?: string; text?: string };
  return data.transcript ?? data.text ?? null;
}

export async function downloadMedia(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

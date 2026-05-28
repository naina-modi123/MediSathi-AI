import { config } from "../config.js";
import { saveMediaFile } from "../utils/media.js";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

export interface TtsOptions {
  languageCode: string;
  text: string;
  speaker?: string;
}

export async function synthesizeReminderSpeech(
  options: TtsOptions
): Promise<{ buffer: Buffer; publicUrl: string } | null> {
  if (!config.SARVAM_API_KEY) return null;

  const res = await fetch(SARVAM_TTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": config.SARVAM_API_KEY,
    },
    body: JSON.stringify({
      inputs: [options.text],
      target_language_code: options.languageCode,
      speaker: options.speaker ?? "anushka",
      model: "bulbul:v2",
      speech_sample_rate: 22050,
      enable_preprocessing: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Sarvam TTS error:", res.status, err);
    return null;
  }

  const data = (await res.json()) as {
    audios?: string[];
  };

  const b64 = data.audios?.[0];
  if (!b64) return null;

  const buffer = Buffer.from(b64, "base64");
  const filename = `tts_${Date.now()}_${options.languageCode}.wav`;
  const { publicUrl } = await saveMediaFile(buffer, filename);
  return { buffer, publicUrl };
}


export function buildReminderSpeechText(
  patientName: string,
  medicineName: string,
  instructions: string | null,
  languageCode: string
): string {
  const templates: Record<string, string> = {
    "hi-IN":
      `${patientName} जी, ${medicineName} की दवा लेने का समय हो गया है। ` +
      `${instructions ?? "कृपया दवा लें।"}`,

    "en-IN":
      `${patientName}, it is time to take your medicine ${medicineName}. ` +
      `${instructions ?? "Please take it now."}`,

    "ta-IN":
      `${patientName}, ${medicineName} மருந்து எடுத்துக்கொள்ள வேண்டிய நேரம்.`,

    "te-IN":
      `${patientName}, ${medicineName} మందు తీసుకునే సమయం వచ్చింది.`,

    "bn-IN":
      `${patientName}, ${medicineName} ওষুধ খাওয়ার সময় হয়েছে।`,

    "mr-IN":
      `${patientName}, ${medicineName} औषध घेण्याची वेळ झाली आहे.`,
  };

  return templates[languageCode] ?? templates["en-IN"];
}


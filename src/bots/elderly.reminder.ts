import { prisma } from "../db.js";
import { normalizePhone } from "../utils/phone.js";
import { handleDoseButton, handleVoiceIntent } from "../services/dose.service.js";
import {
  downloadMedia,
  mapTranscriptToIntent,
  transcribeAudio,
} from "../services/sarvam.stt.js";
import * as messaging from "../services/twilio.client.js";

export async function isPatientPhone(phone: string): Promise<boolean> {
  const patient = await prisma.patient.findUnique({
    where: { phone: normalizePhone(phone) },
  });
  return !!patient;
}

export async function handlePatientMessage(
  phone: string,
  payload: {
    type: string;
    text?: string;
    buttonId?: string;
    audioUrl?: string;
  }
): Promise<void> {
  if (payload.buttonId) {
    await handleDoseButton(phone, payload.buttonId);
    return;
  }

  if (payload.type === "audio" && payload.audioUrl) {
    const patient = await prisma.patient.findUnique({
      where: { phone: normalizePhone(phone) },
    });
    const buffer = await downloadMedia(payload.audioUrl);
    if (!buffer) {
      await messaging.sendText(phone, "Could not hear your voice. Please tap a button.");
      return;
    }
    const transcript = await transcribeAudio(
      buffer,
      patient?.preferredLanguage ?? "unknown"
    );
    const intent = mapTranscriptToIntent(transcript ?? "");
    await handleVoiceIntent(phone, intent);
    return;
  }

  if (payload.text) {
    const t = payload.text.toLowerCase();
    if (/\b(taken|liya|ले ली|done)\b/i.test(t)) {
      await handleDoseButton(phone, "dose_taken");
    } else if (/\b(later|baad|बाद)\b/i.test(t)) {
      await handleDoseButton(phone, "dose_later");
    } else if (/\b(skip|skipped|nahi)\b/i.test(t)) {
      await handleDoseButton(phone, "dose_skipped");
    } else {
      await messaging.sendText(
        phone,
        "Please tap ✅ Taken, ⏳ Will take, or ❌ Skipped — or send a voice note."
      );
    }
  }
}

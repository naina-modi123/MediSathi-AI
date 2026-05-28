import { DoseStatus, ResponseSource } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import * as messaging from "./twilio.client.js";
import { placeReminderCall } from "./twilio.voice.js";
import {
  buildReminderSpeechText,
  synthesizeReminderSpeech,
} from "./sarvam.tts.js";
import { formatTime12h } from "../utils/timezone.js";

export async function getPendingEventForPatientPhone(phone: string) {
  const patient = await prisma.patient.findUnique({ where: { phone } });
  if (!patient || patient.paused) return null;

  return prisma.doseEvent.findFirst({
    where: {
      status: { in: ["pending", "reminded", "snoozed"] },
      schedule: { medicine: { patientId: patient.id, active: true } },
    },
    orderBy: { scheduledAt: "desc" },
    include: {
      schedule: {
        include: { medicine: { include: { patient: true } } },
      },
    },
  });
}

export async function recordDoseResponse(
  eventId: string,
  status: DoseStatus,
  source: ResponseSource
): Promise<void> {
  await prisma.doseEvent.update({
    where: { id: eventId },
    data: {
      status,
      respondedAt: new Date(),
      responseSource: source,
    },
  });
}

function localizedButtons(lang: string): messaging.DoseButtonLabels {
  const map: Record<string, messaging.DoseButtonLabels> = {
    "hi-IN": { taken: "ले ली", later: "थोड़ी देर", skipped: "नहीं" },
    "en-IN": { taken: "Taken", later: "Will take", skipped: "Skipped" },
    "ta-IN": { taken: "சாப்பிட்டேன்", later: "பிறகு", skipped: "வேண்டாம்" },
  };
  return map[lang] ?? map["en-IN"];
}

function buildReminderText(
  patientName: string,
  medicineName: string,
  instructions: string | null,
  windowStart: string,
  timezone: string,
  lang: string
): string {
  const timeStr = formatTime12h(windowStart, timezone);
  const templates: Record<string, string> = {
    "hi-IN": `${medicineName}\n\nनमस्ते ${patientName} जी,\nअब दवा लेने का समय है (${timeStr}).\n${instructions ? `\n${instructions}` : ""}`,
    "en-IN": `${medicineName}\n\nHello ${patientName},\nTime for your medicine (${timeStr}).\n${instructions ? `\n${instructions}` : ""}`,
    "ta-IN": `${medicineName}\n\nவணக்கம் ${patientName},\nமருந்து நேரம் (${timeStr}).`,
  };
  return templates[lang] ?? templates["en-IN"];
}

export async function sendReminderForEvent(eventId: string): Promise<void> {
  const event = await prisma.doseEvent.findUnique({
    where: { id: eventId },
    include: {
      schedule: {
        include: { medicine: { include: { patient: true } } },
      },
    },
  });
  if (!event) return;

  const patient = event.schedule.medicine.patient;
  const med = event.schedule.medicine;
  const lang = patient.preferredLanguage;
  const body = buildReminderText(
    patient.name,
    med.name,
    med.instructions,
    event.schedule.windowStart,
    patient.timezone,
    lang
  );

  const result = await messaging.sendDoseReminder(
    patient.phone,
    body,
    localizedButtons(lang)
  );

  await prisma.doseEvent.update({
    where: { id: eventId },
    data: { status: "reminded", reminderSentAt: new Date() },
  });

  await prisma.reminderLog.create({
    data: {
      doseEventId: eventId,
      providerSid: result.requestId ?? undefined,
      messageType: "whatsapp_reminder",
    },
  });

  let audioUrl: string | undefined;

  if (event.schedule.voiceEnabled && patient.voiceEnabled) {
    const speechText = buildReminderSpeechText(
      patient.name,
      med.name,
      med.instructions,
      lang
    );
    const tts = await synthesizeReminderSpeech({
      languageCode: lang,
      text: speechText,
    });
    
let audioUrl = "";


    if (tts?.publicUrl) {
      audioUrl = tts.publicUrl;
      await messaging.sendAudio(patient.phone, tts.publicUrl);
      await prisma.reminderLog.create({
        data: { doseEventId: eventId, messageType: "whatsapp_audio" },
      });
    }

   
if (config.VOICE_CALL_ENABLED && audioUrl) {
  const call = await placeReminderCall(
    patient.phone,
    audioUrl
  );

  await prisma.reminderLog.create({
    data: {
      doseEventId: eventId,
      providerSid: call.sid,
      messageType: "voice_call",
    },
  });
}


  }
}

export async function notifyCaregiversMissedDose(eventId: string): Promise<void> {
  const event = await prisma.doseEvent.findUnique({
    where: { id: eventId },
    include: {
      schedule: {
        include: {
          medicine: {
            include: {
              patient: {
                include: {
                  caregivers: { include: { caregiver: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!event) return;

  const patient = event.schedule.medicine.patient;
  const med = event.schedule.medicine;
  const timeStr = formatTime12h(event.schedule.windowStart, patient.timezone);

  for (const link of patient.caregivers) {
    const msg = `⚠️ Missed dose alert\n\n${patient.name} did not confirm ${med.name} (${timeStr}).\n\nReply STATUS for today's summary.`;
    await messaging.sendText(link.caregiver.phone, msg);
  }
}

export async function notifyCaregiversSkipped(eventId: string): Promise<void> {
  const event = await prisma.doseEvent.findUnique({
    where: { id: eventId },
    include: {
      schedule: {
        include: {
          medicine: {
            include: {
              patient: {
                include: { caregivers: { include: { caregiver: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!event) return;

  const patient = event.schedule.medicine.patient;
  const med = event.schedule.medicine;

  for (const link of patient.caregivers) {
    await messaging.sendText(
      link.caregiver.phone,
      `ℹ️ ${patient.name} skipped ${med.name} for this dose window.`
    );
  }
}

export async function handleDoseButton(
  patientPhone: string,
  buttonId: string
): Promise<void> {
  const event = await getPendingEventForPatientPhone(patientPhone);
  if (!event) {
    await messaging.sendText(
      patientPhone,
      "No active medicine reminder right now. Thank you!"
    );
    return;
  }

  switch (buttonId) {
    case "dose_taken":
      await recordDoseResponse(event.id, "taken", "button");
      await messaging.sendText(patientPhone, "✅ Recorded. Get well soon!");
      break;
    case "dose_later":
      await recordDoseResponse(event.id, "snoozed", "button");
      await messaging.sendText(
        patientPhone,
        `⏳ Okay. We will remind you again in ${config.SNOOZE_MINUTES} minutes.`
      );
      break;
    case "dose_skipped":
      await recordDoseResponse(event.id, "skipped", "button");
      await notifyCaregiversSkipped(event.id);
      await messaging.sendText(patientPhone, "Noted. Skipped for this time.");
      break;
    default:
      break;
  }
}

export async function handleVoiceIntent(
  patientPhone: string,
  intent: "taken" | "later" | "skipped" | "unclear"
): Promise<void> {
  const event = await getPendingEventForPatientPhone(patientPhone);
  if (!event) {
    await messaging.sendText(
      patientPhone,
      "No active reminder. Reply when you receive a reminder."
    );
    return;
  }

  if (intent === "unclear") {
    await sendReminderForEvent(event.id);
    return;
  }

  const buttonMap = {
    taken: "dose_taken",
    later: "dose_later",
    skipped: "dose_skipped",
  } as const;
  await handleDoseButton(patientPhone, buttonMap[intent]);
  await prisma.doseEvent.update({
    where: { id: event.id },
    data: { responseSource: "voice" },
  });
}

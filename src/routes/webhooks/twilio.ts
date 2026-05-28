import { FastifyInstance, FastifyRequest } from "fastify";
import twilio from "twilio";
import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { normalizePhone } from "../../utils/phone.js";
import {
  handleCaregiverCommand,
  handleSetupListReply,
  handleSetupMessage,
} from "../../bots/caregiver.setup.js";
import { handlePatientMessage, isPatientPhone } from "../../bots/elderly.reminder.js";
import { handleDoseButton } from "../../services/dose.service.js";
import {
  mapGatherDigit,
  buildGatherTwiml,
} from "../../services/twilio.voice.js";
import { downloadMedia, mapTranscriptToIntent, transcribeAudio } from "../../services/sarvam.stt.js";
import * as messaging from "../../services/twilio.client.js";

async function isDuplicateWebhook(id: string): Promise<boolean> {
  try {
    await prisma.processedWebhook.create({ data: { id } });
    return false;
  } catch {
    return true;
  }
}

function parseWhatsAppFrom(from: string): string {
  return normalizePhone(from.replace(/^whatsapp:/i, ""));
}

function parseBodyToButtonId(body: string): string | null {
  const t = body.trim().toLowerCase();
  if (["1", "taken", "done", "yes", "ले ली", "ली"].some((x) => t === x || t.includes(x))) {
    return "dose_taken";
  }
  if (["2", "later", "will take", "baad", "बाद", "थोड़ी"].some((x) => t === x || t.includes(x))) {
    return "dose_later";
  }
  if (["3", "skip", "skipped", "no", "nahi", "नहीं"].some((x) => t === x || t.includes(x))) {
    return "dose_skipped";
  }
  return null;
}

async function routeInbound(from: string, incomingBody: string, mediaUrl?: string): Promise<void> {
  let body = incomingBody;
  const upper = incomingBody.trim().toUpperCase();
  console.log(`[WhatsApp] Received from ${from}: "${incomingBody}"`);

  // if (mediaUrl) {
  //   if (await isPatientPhone(from)) {
  //     const patient = await prisma.patient.findUnique({ where: { phone: from } });
  //     const buffer = await downloadMedia(mediaUrl);
  //     if (buffer) {
  //       const transcript = await transcribeAudio(
  //         buffer,
  //         patient?.preferredLanguage ?? "unknown"
  //       );
  //       const intent = mapTranscriptToIntent(transcript ?? "");
  //       const { handleVoiceIntent } = await import("../../services/dose.service.js");
  //       await handleVoiceIntent(from, intent);
  //       return;
  //     }
  //   }
  // }
  
if (mediaUrl) {
  console.log("[Voice] Audio message received");

  try {
    const patient = await prisma.patient.findUnique({
      where: { phone: from },
    });

    // Download audio from Twilio
    const buffer = await downloadMedia(mediaUrl);

    if (buffer) {
      // Convert speech → text using Sarvam
      const transcript = await transcribeAudio(
        buffer,
        patient?.preferredLanguage ?? "unknown"
      );

      console.log("[Voice Transcript]", transcript);

      // If transcript exists, replace body text
      if (transcript) {
        body = transcript;
      }

      // Patient voice response handling
      if (await isPatientPhone(from)) {
        const intent = mapTranscriptToIntent(transcript ?? "");

        const { handleVoiceIntent } = await import("../../services/dose.service.js");

        if (intent) {
          await handleVoiceIntent(from, intent);
          return;
        }
      }
    }
  } catch (err) {
    console.error("[Voice Processing Error]", err);
  }
}



  const buttonId = parseBodyToButtonId(body);
  if (buttonId && (await isPatientPhone(from))) {
    console.log(`[WhatsApp] Patient ${from} pressed button: ${buttonId}`);
    await handleDoseButton(from, buttonId);
    return;
  }

  if (upper.startsWith("LANG_") || ["lang_hi", "lang_en", "lang_ta", "lang_te", "lang_bn"].includes(upper.toLowerCase())) {
    const handled = await handleSetupListReply(from, upper.toLowerCase());
    if (handled) return;
  }

  if (upper === "VOICE_YES" || upper === "VOICE_NO") {
    const handled = await handleSetupListReply(from, upper.toLowerCase());
    if (handled) return;
  }

  console.log(`[WhatsApp] Checking caregiver command: "${upper}"`);
  const cmdHandled = await handleCaregiverCommand(from, body);
  if (cmdHandled) {
    console.log(`[WhatsApp] Command handled: "${upper}"`);
    return;
  }

  console.log(`[WhatsApp] Checking setup message for: "${upper}"`);
  const setupHandled = await handleSetupMessage(from, body);
  if (setupHandled) {
    console.log(`[WhatsApp] Setup handled: "${upper}"`);
    return;
  }

  if (await isPatientPhone(from)) {
    console.log(`[WhatsApp] Patient message from ${from}`);
    await handlePatientMessage(from, { type: "text", text: body, audioUrl: mediaUrl });
    return;
  }

  console.log(`[WhatsApp] Sending welcome message to ${from}`);
  await messaging.sendText(
    from,
    "🙏 Welcome to MediSathi!\n\nFamily: send SETUP to add medicine reminders.\nPatient: reply 1=Taken, 2=Later, 3=Skip when reminded.\n\nCommands: SETUP, STATUS, PAUSE, RESUME"
  );
}

export async function registerTwilioWebhooks(app: FastifyInstance): Promise<void> {
  app.post("/webhooks/twilio/whatsapp", async (req: FastifyRequest, reply) => {
    const body = req.body as Record<string, string>;
    const messageSid = body.MessageSid ?? body.SmsMessageSid ?? "";
    if (messageSid && (await isDuplicateWebhook(messageSid))) {
      return reply.type("text/xml").send("<Response></Response>");
    }

    const from = parseWhatsAppFrom(body.From ?? "");
    const text = body.Body ?? "";
    const numMedia = parseInt(body.NumMedia ?? "0", 10);
    const mediaUrl = numMedia > 0 ? body.MediaUrl0 : undefined;

    try {
      await routeInbound(from, text, mediaUrl);
    } catch (err) {
      req.log.error({ err, from }, "Twilio WhatsApp handler error");
    }

    return reply.type("text/xml").send("<Response></Response>");
  });

  app.post("/webhooks/twilio/status", async (req: FastifyRequest) => {
    const body = req.body as Record<string, string>;
    const sid = body.MessageSid;
    const status = body.MessageStatus;
    if (sid && status) {
      await prisma.reminderLog.updateMany({
        where: { providerSid: sid },
        data: { statusCode: status },
      });
    }
    return { ok: true };
  });

  app.post("/webhooks/twilio/voice/reminder", async (req: FastifyRequest, reply) => {
    const q = req.query as { audioUrl?: string };
    const twiml = buildGatherTwiml(q.audioUrl);
    return reply.type("text/xml").send(twiml);
  });

  app.post("/webhooks/twilio/voice/gather", async (req: FastifyRequest, reply) => {
    const body = req.body as Record<string, string>;
    const digit = body.Digits ?? "";
    const from = normalizePhone(body.From ?? "");

    const buttonId = mapGatherDigit(digit);
    if (buttonId && (await isPatientPhone(from))) {
      await handleDoseButton(from, buttonId);
    }

    const VoiceResponse = twilio.twiml.VoiceResponse;
    const vr = new VoiceResponse();
    vr.say({ language: "hi-IN" }, "Dhanyavaad. Aapka jawab darj ho gaya.");
    return reply.type("text/xml").send(vr.toString());
  });

  app.post("/webhooks/twilio/voice/status", async () => ({ ok: true }));
}

import twilio from "twilio";
import { config, isDevMockMessaging, webhookCallbackUrl } from "../config.js";
import { normalizePhone } from "../utils/phone.js";
import { pushMockMessage } from "./messaging.mock.js";

export interface SendResult {
  requestId?: string;
  raw: unknown;
}

export interface DoseButtonLabels {
  taken: string;
  later: string;
  skipped: string;
}

let _client: ReturnType<typeof twilio> | null = null;

export function getTwilioClient(): ReturnType<typeof twilio> {
  if (!_client) {
    _client = twilio(
  config.TWILIO_ACCOUNT_SID,
  config.TWILIO_AUTH_TOKEN
);
  }
  return _client;
}

export function toWhatsAppAddress(phone: string): string {
  const digits = normalizePhone(phone);
  return `whatsapp:+${digits}`;
}

export function fromWhatsAppAddress(): string {
  const digits = normalizePhone(config.TWILIO_WHATSAPP_FROM);
  return `whatsapp:+${digits}`;
}

export async function sendText(to: string, body: string): Promise<SendResult> {
  if (isDevMockMessaging()) {
    return pushMockMessage(to, "text", body);
  }

  const toAddr = toWhatsAppAddress(to);
  const fromAddr = fromWhatsAppAddress();
  
  try {
    console.log(`[Twilio] Sending text to ${toAddr}: "${body.substring(0, 50)}..."`);
    const msg = await getTwilioClient().messages.create({
      from: fromAddr,
      to: toAddr,
      body,
      statusCallback: webhookCallbackUrl("/webhooks/twilio/status"),
    });
    console.log(`[Twilio] Message sent successfully. SID: ${msg.sid}`);
    return { requestId: msg.sid, raw: msg };
  } catch (err) {
    console.error(`[Twilio] Failed to send message to ${toAddr}:`, err);
    throw err;
  }
}

export async function sendAudio(to: string, audioUrl: string): Promise<SendResult> {
  if (isDevMockMessaging()) {
    return pushMockMessage(to, "audio", audioUrl);
  }

  const msg = await getTwilioClient().messages.create({
    from: fromWhatsAppAddress(),
    to: toWhatsAppAddress(to),
    mediaUrl: [audioUrl],
  });
  return { requestId: msg.sid, raw: msg };
}

/** Quick-reply style reminder (text fallback; optional Content template). */
export async function sendDoseReminder(
  to: string,
  bodyText: string,
  labels: DoseButtonLabels
): Promise<SendResult> {
  const footer =
    `\n\nReply:\n` +
    `*1* — ${labels.taken}\n` +
    `*2* — ${labels.later}\n` +
    `*3* — ${labels.skipped}\n\n` +
    `Or say: taken / later / skip`;

  const fullBody = bodyText + footer;

  if (isDevMockMessaging()) {
    return pushMockMessage(to, "interactive:buttons", fullBody);
  }

  if (config.TWILIO_WHATSAPP_REMINDER_CONTENT_SID) {
    try {
      const msg = await getTwilioClient().messages.create({
        from: fromWhatsAppAddress(),
        to: toWhatsAppAddress(to),
        contentSid: config.TWILIO_WHATSAPP_REMINDER_CONTENT_SID,
        contentVariables: JSON.stringify({
          body: bodyText,
          btn_taken: labels.taken,
          btn_later: labels.later,
          btn_skip: labels.skipped,
        }),
      });
      return { requestId: msg.sid, raw: msg };
    } catch (err) {
      console.warn("Content template send failed, using text fallback:", err);
    }
  }

  return sendText(to, fullBody);
}

export async function sendListMessage(
  to: string,
  bodyText: string,
  _buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>
): Promise<SendResult> {
  const lines = sections.flatMap((s) =>
    s.rows.map((r, i) => `${r.id} — ${r.title}${r.description ? ` (${r.description})` : ""}`)
  );
  const body = `${bodyText}\n\n${lines.join("\n")}\n\nReply with the option code (e.g. lang_hi).`;
  return sendText(to, body);
}

export async function sendTemplate(
  to: string,
  _templateName: string,
  _languageCode: string,
  bodyParams: string[]
): Promise<SendResult> {
  return sendText(to, bodyParams.join(" — "));
}

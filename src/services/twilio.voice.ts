
import twilio from "twilio";
import { config } from "../config.js";

const client = twilio(
  config.TWILIO_ACCOUNT_SID,
  config.TWILIO_AUTH_TOKEN
);

export async function placeReminderCall(
  to: string,
  audioUrl: string
) {
  try {
    const call = await client.calls.create({
      to: `+${to.replace(/\D/g, "")}`,
      from: config.TWILIO_VOICE_FROM!,
      url:
        `${config.WEBHOOK_BASE_URL}` +
        `/webhooks/twilio/voice/reminder` +
        `?audioUrl=${encodeURIComponent(audioUrl)}`,
      method: "POST",
    });

    console.log("[Twilio Voice] Call placed:", call.sid);

    return call;
  } catch (err) {
    console.error("[Twilio Voice Error]", err);
    throw err;
  }
}
export function buildGatherTwiml(audioUrl?: string): string {
  const VoiceResponse = twilio.twiml.VoiceResponse;

  const vr = new VoiceResponse();

  if (audioUrl) {
    vr.play(audioUrl);
  }

  const gather = vr.gather({
    numDigits: 1,
    action: "/webhooks/twilio/voice/gather",
    method: "POST",
  });

  gather.say(
    { language: "hi-IN" },
    "Dawai le li ho toh 1 dabaiye. Baad mein lene ke liye 2 dabaiye. Skip karne ke liye 3 dabaiye."
  );

  return vr.toString();
}

export function mapGatherDigit(digit: string): string | null {
  if (digit === "1") return "dose_taken";
  if (digit === "2") return "dose_later";
  if (digit === "3") return "dose_skipped";

  return null;
}




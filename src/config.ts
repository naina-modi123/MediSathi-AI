import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  WEBHOOK_BASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_WHATSAPP_FROM: z.string().min(10),
  TWILIO_VOICE_FROM: z.string().optional(),
  TWILIO_WHATSAPP_REMINDER_CONTENT_SID: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  MEDIA_PUBLIC_BASE_URL: z.string().default("http://localhost:3000/media"),
  MEDIA_STORAGE_DIR: z.string().default("./media"),
  DEFAULT_TIMEZONE: z.string().default("Asia/Kolkata"),
  GRACE_MINUTES_AFTER_WINDOW: z.coerce.number().default(15),
  SNOOZE_MINUTES: z.coerce.number().default(15),
  FOLLOWUP_MINUTES_AFTER_START: z.coerce.number().default(10),
  VOICE_CALL_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  DEV_MOCK_MESSAGING: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

function loadConfig() {
  if (process.env.TWILIO_API_KEY && !process.env.TWILIO_API_KEY_SECRET) {
    process.env.TWILIO_API_KEY_SECRET = process.env.TWILIO_API_KEY;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    console.warn(`Config warning: ${missing}`);
    return envSchema.parse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ?? "AC_dev",
      TWILIO_API_KEY_SID: process.env.TWILIO_API_KEY_SID ?? "SK_dev",
      TWILIO_API_KEY_SECRET: process.env.TWILIO_API_KEY_SECRET ?? "dev",
      TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM ?? "14155238886",
    });
  }
  return parsed.data;
}

export const config = loadConfig();

export const isDevMockMessaging = (): boolean =>
  Boolean(process.env.DEV_MOCK_MESSAGING === "true" || process.env.DEV_MOCK_MESSAGING === "1");

export function webhookCallbackUrl(path: string): string | undefined {
  if (!config.WEBHOOK_BASE_URL) return undefined;
  return `${config.WEBHOOK_BASE_URL.replace(/\/$/, "")}${path}`;
}

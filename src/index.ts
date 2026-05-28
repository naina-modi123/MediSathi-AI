import Fastify from "fastify";
import fs from "fs";
import path from "path";
import { config } from "./config.js";
import { registerTwilioWebhooks } from "./routes/webhooks/twilio.js";
import { registerDevRoutes } from "./routes/dev.js";
import { startScheduler } from "./services/scheduler.service.js";
import { isDevMockMessaging } from "./config.js";
import { ensureMediaDir } from "./utils/media.js";
import { voiceRoutes } from "./routes/webhooks/twilio.voice";

async function main() {
  await ensureMediaDir();

  const app = Fastify({
    logger: {
      transport:
        config.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const parsed = Object.fromEntries(new URLSearchParams(body as string));
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  app.get("/", async () => ({
    message: "MediSathi — Medicine reminder bot for elderly care",
    status: "running",
    service: "twilio+sarvam",
    endpoints: {
      health: "GET /health",
      devTools: "GET /dev",
      media: "GET /media/:filename",
      webhooks: {
        whatsapp: "POST /webhooks/twilio/whatsapp",
        voice: "POST /webhooks/twilio/voice/*",
      },
    },
  }));

  app.get("/health", async () => ({
    status: "ok",
    service: "medisathi",
    provider: "twilio+sarvam",
  }));

  const mediaDir = path.resolve(config.MEDIA_STORAGE_DIR);
  app.get("/media/:filename", async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const safe = path.basename(filename);
    const filePath = path.join(mediaDir, safe);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: "Not found" });
    }
    const ext = path.extname(safe).toLowerCase();
    const type =
      ext === ".mp3"
        ? "audio/mpeg"
        : ext === ".wav"
          ? "audio/wav"
          : "application/octet-stream";
    return reply.type(type).send(fs.createReadStream(filePath));
  });

  await registerTwilioWebhooks(app);
  await registerDevRoutes(app);
  startScheduler();

  const port = config.PORT;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`MediSathi running on http://localhost:${port}`);
  console.log(`WhatsApp webhook: POST /webhooks/twilio/whatsapp`);
  console.log(`Voice webhooks: POST /webhooks/twilio/voice/*`);
  if (isDevMockMessaging()) {
    console.log(`DEV MOCK mode — messages/calls print to console`);
    console.log(`E2E test: POST http://localhost:${port}/dev/e2e`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

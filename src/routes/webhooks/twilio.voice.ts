
import { FastifyInstance } from "fastify";

export async function voiceRoutes(app: FastifyInstance) {
  app.post("/webhooks/twilio/voice/reminder", async (req, reply) => {
    const body: any = req.body;

    const audioUrl = body.audioUrl;

    const twiml = `
<Response>
  <Play>${audioUrl}</Play>
</Response>
`;

    reply.type("text/xml");
    return twiml;
  });
}


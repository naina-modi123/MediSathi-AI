import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { config, isDevMockMessaging } from "../config.js";
import { clearMockOutbox, getMockOutbox } from "../services/messaging.mock.js";
import { processReminders } from "../services/scheduler.service.js";
import { daysBitmaskFromList, minutesSinceMidnight } from "../utils/timezone.js";
import { normalizePhone } from "../utils/phone.js";

export async function registerDevRoutes(app: FastifyInstance): Promise<void> {
  if (config.NODE_ENV === "production") return;

  app.get("/dev", async () => ({
    message: "MediSathi dev tools (Twilio + Sarvam)",
    mockMessaging: isDevMockMessaging(),
    endpoints: {
      seed: "POST /dev/seed",
      scheduler: "POST /dev/run-scheduler",
      messages: "GET /dev/messages",
      simulateIncoming: "POST /dev/simulate-incoming",
      e2e: "POST /dev/e2e",
    },
  }));

  app.post("/dev/seed", async (req) => {
    const body = (req.body ?? {}) as {
      caregiverPhone?: string;
      patientPhone?: string;
      patientName?: string;
      medicineName?: string;
      windowMinutes?: number;
    };

    const caregiverPhone = normalizePhone(body.caregiverPhone ?? "919876543210");
    const patientPhone = normalizePhone(body.patientPhone ?? "919876543211");
    const patientName = body.patientName ?? "Ram Singh";
    const medicineName = body.medicineName ?? "Metformin";
    const windowMinutes = body.windowMinutes ?? 30;

    const now = new Date();
    const tz = config.DEFAULT_TIMEZONE;
    const currentMin = minutesSinceMidnight(now, tz);
    const startH = Math.floor(currentMin / 60);
    const startM = currentMin % 60;
    const endMin = currentMin + windowMinutes;
    const endH = Math.floor(endMin / 60) % 24;
    const endM = endMin % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    const windowStart = `${pad(startH)}:${pad(startM)}`;
    const windowEnd = `${pad(endH)}:${pad(endM)}`;

    const caregiver = await prisma.caregiver.upsert({
      where: { phone: caregiverPhone },
      create: { phone: caregiverPhone, name: "Family Member" },
      update: {},
    });

    const patient = await prisma.patient.upsert({
      where: { phone: patientPhone },
      create: {
        phone: patientPhone,
        name: patientName,
        preferredLanguage: "hi-IN",
        voiceEnabled: false,
      },
      update: { name: patientName, paused: false },
    });

    await prisma.caregiverPatient.upsert({
      where: {
        caregiverId_patientId: { caregiverId: caregiver.id, patientId: patient.id },
      },
      create: { caregiverId: caregiver.id, patientId: patient.id },
      update: {},
    });

    const medicine = await prisma.medicine.create({
      data: {
        patientId: patient.id,
        name: medicineName,
        instructions: "1 tablet after food",
      },
    });

    const schedule = await prisma.doseSchedule.create({
      data: {
        medicineId: medicine.id,
        daysOfWeek: daysBitmaskFromList(["everyday"]),
        windowStart,
        windowEnd,
        voiceEnabled: false,
      },
    });

    return {
      ok: true,
      caregiverPhone,
      patientPhone,
      windowStart,
      windowEnd,
      scheduleId: schedule.id,
    };
  });

  app.post("/dev/run-scheduler", async () => {
    await processReminders();
    return { ok: true, messages: getMockOutbox().length };
  });

  app.get("/dev/messages", async () => ({
    mock: isDevMockMessaging(),
    count: getMockOutbox().length,
    messages: getMockOutbox(),
  }));

  app.delete("/dev/messages", async () => {
    clearMockOutbox();
    return { ok: true };
  });

  app.post("/dev/simulate-incoming", async (req) => {
    const body = (req.body ?? {}) as {
      from?: string;
      text?: string;
      buttonId?: string;
      listId?: string;
    };
    const from = normalizePhone(body.from ?? "919876543211");
    const port = config.PORT;
    const text = body.buttonId
      ? body.buttonId === "dose_taken"
        ? "1"
        : body.buttonId === "dose_later"
          ? "2"
          : "3"
      : body.listId ?? body.text ?? "";

    const form = new URLSearchParams({
      MessageSid: `sim_${Date.now()}`,
      From: `whatsapp:+${from}`,
      To: `whatsapp:+${normalizePhone(config.TWILIO_WHATSAPP_FROM)}`,
      Body: text,
      NumMedia: "0",
    });

    const res = await fetch(`http://127.0.0.1:${port}/webhooks/twilio/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    return { ok: res.ok, status: res.status, messages: getMockOutbox() };
  });

  app.post("/dev/e2e", async (req) => {
    const body = (req.body ?? {}) as {
      caregiverPhone?: string;
      patientPhone?: string;
    };
    const caregiverPhone = normalizePhone(body.caregiverPhone ?? "919876543210");
    const patientPhone = normalizePhone(body.patientPhone ?? "919876543211");
    const port = config.PORT;
    const base = `http://127.0.0.1:${port}`;

    clearMockOutbox();
    const steps: string[] = [];

    async function sim(from: string, text?: string, buttonId?: string) {
      const res = await fetch(`${base}/dev/simulate-incoming`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, text, buttonId }),
      });
      steps.push(`${buttonId ?? text} → ${res.status}`);
    }

    await fetch(`${base}/dev/seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caregiverPhone, patientPhone }),
    });
    steps.push("seeded schedule");

    await fetch(`${base}/dev/run-scheduler`, { method: "POST" });
    steps.push("scheduler ran");

    await sim(patientPhone, "1");
    steps.push("patient replied 1 (Taken)");

    await sim(caregiverPhone, "STATUS");
    steps.push("caregiver STATUS");

    const events = await prisma.doseEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { schedule: { include: { medicine: true } } },
    });

    return {
      ok: true,
      steps,
      latestDoseStatus: events[0]?.status,
      mockMessages: getMockOutbox(),
    };
  });
}

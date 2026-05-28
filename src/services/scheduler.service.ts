import cron from "node-cron";
import { DoseStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import {
  hhmmToMinutes,
  isDayActive,
  isWithinWindow,
  minutesSinceMidnight,
  startOfLocalDay,
} from "../utils/timezone.js";
import {
  notifyCaregiversMissedDose,
  sendReminderForEvent,
} from "./dose.service.js";
import * as messaging from "./twilio.client.js";

function scheduledAtForToday(windowStart: string, timeZone: string, now: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  const { hours, minutes } = (() => {
    const [h, m] = windowStart.split(":").map(Number);
    return { hours: h ?? 8, minutes: m ?? 0 };
  })();
  const local = new Date(`${ymd}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
  return local;
}

async function ensureTodayEvents(): Promise<void> {
  const schedules = await prisma.doseSchedule.findMany({
    where: { active: true, medicine: { active: true } },
    include: { medicine: { include: { patient: true } } },
  });

  const now = new Date();

  for (const schedule of schedules) {
    const patient = schedule.medicine.patient;
    if (patient.paused) continue;

    if (schedule.startDate && now < schedule.startDate) continue;
    if (schedule.endDate && now > schedule.endDate) continue;
    if (!isDayActive(schedule.daysOfWeek, now, patient.timezone)) continue;

    const scheduledAt = scheduledAtForToday(
      schedule.windowStart,
      patient.timezone,
      now
    );

    await prisma.doseEvent.upsert({
      where: {
        scheduleId_scheduledAt: {
          scheduleId: schedule.id,
          scheduledAt,
        },
      },
      create: {
        scheduleId: schedule.id,
        scheduledAt,
        status: "pending",
      },
      update: {},
    });
  }
}

export async function processReminders(): Promise<void> {
  await ensureTodayEvents();

  const events = await prisma.doseEvent.findMany({
    where: {
      status: { in: ["pending", "reminded", "snoozed"] },
    },
    include: {
      schedule: {
        include: { medicine: { include: { patient: true } } },
      },
    },
  });

  const now = new Date();

  for (const event of events) {
    const patient = event.schedule.medicine.patient;
    const tz = patient.timezone;
    const { windowStart, windowEnd } = event.schedule;

    if (!isWithinWindow(now, windowStart, windowEnd, tz)) {
      await checkMissedDose(event.id, now, windowEnd, tz);
      continue;
    }

    const currentMin = minutesSinceMidnight(now, tz);
    const startMin = hhmmToMinutes(windowStart);

    if (event.status === "pending" && currentMin >= startMin) {
      await sendReminderForEvent(event.id);
      continue;
    }

    if (
      event.status === "reminded" &&
      !event.followupSentAt &&
      currentMin >= startMin + config.FOLLOWUP_MINUTES_AFTER_START
    ) {
      await sendReminderForEvent(event.id);
      await prisma.doseEvent.update({
        where: { id: event.id },
        data: { followupSentAt: new Date() },
      });
    }

    if (event.status === "snoozed" && event.respondedAt) {
      const snoozeDue = new Date(
        event.respondedAt.getTime() + config.SNOOZE_MINUTES * 60 * 1000
      );
      if (now >= snoozeDue && currentMin <= hhmmToMinutes(windowEnd)) {
        await prisma.doseEvent.update({
          where: { id: event.id },
          data: { status: "reminded" },
        });
        await sendReminderForEvent(event.id);
      }
    }
  }
}

async function checkMissedDose(
  eventId: string,
  now: Date,
  windowEnd: string,
  timeZone: string
): Promise<void> {
  const event = await prisma.doseEvent.findUnique({
    where: { id: eventId },
    include: { schedule: { include: { medicine: { include: { patient: true } } } } },
  });
  if (!event || ["taken", "skipped", "missed"].includes(event.status)) return;

  const endMin = hhmmToMinutes(windowEnd) + config.GRACE_MINUTES_AFTER_WINDOW;
  const currentMin = minutesSinceMidnight(now, timeZone);

  if (currentMin > endMin) {
    await prisma.doseEvent.update({
      where: { id: eventId },
      data: { status: "missed" },
    });
    await notifyCaregiversMissedDose(eventId);
  }
}

async function sendDailyDigest(): Promise<void> {
  const start = startOfLocalDay(new Date(), config.DEFAULT_TIMEZONE);

  const patients = await prisma.patient.findMany({
    include: {
      medicines: { include: { schedules: true } },
      caregivers: { include: { caregiver: true } },
    },
  });

  for (const patient of patients) {
    const events = await prisma.doseEvent.findMany({
      where: {
        scheduledAt: { gte: start },
        schedule: { medicine: { patientId: patient.id } },
      },
    });
    if (events.length === 0) continue;

    const taken = events.filter((e) => e.status === "taken").length;
    const total = events.length;
    const summary = `${patient.name}: ${taken}/${total} doses taken today.`;

    for (const link of patient.caregivers) {
      try {
        await messaging.sendText(
          link.caregiver.phone,
          `📊 Daily summary\n${summary}`
        );
      } catch {
        await messaging.sendText(link.caregiver.phone, `📊 Daily summary\n${summary}`);
      }
    }
  }
}

export function startScheduler(): void {
  cron.schedule("* * * * *", () => {
    processReminders().catch((err) => console.error("Scheduler error:", err));
  });

  cron.schedule("0 21 * * *", () => {
    sendDailyDigest().catch((err) => console.error("Digest error:", err));
  });

  console.log("Scheduler started (every minute + daily digest 9 PM IST)");
}

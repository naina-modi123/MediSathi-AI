import { config } from "../config.js";

const DAY_BITS = [1, 2, 4, 8, 16, 32, 64] as const; // Sun..Sat

export function dayBitmaskFromDate(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
    .format(date)
    .slice(0, 3);
  const map: Record<string, number> = {
    Sun: 1,
    Mon: 2,
    Tue: 4,
    Wed: 8,
    Thu: 16,
    Fri: 32,
    Sat: 64,
  };
  return map[weekday] ?? 0;
}

export function isDayActive(daysOfWeek: number, date: Date, timeZone: string): boolean {
  const bit = dayBitmaskFromDate(date, timeZone);
  return (daysOfWeek & bit) !== 0;
}

export function parseTimeHHmm(hhmm: string): { hours: number; minutes: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
}

/** Current local time in timezone as minutes since midnight. */
export function minutesSinceMidnight(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function hhmmToMinutes(hhmm: string): number {
  const { hours, minutes } = parseTimeHHmm(hhmm);
  return hours * 60 + minutes;
}

export function isWithinWindow(
  now: Date,
  windowStart: string,
  windowEnd: string,
  timeZone: string
): boolean {
  const current = minutesSinceMidnight(now, timeZone);
  const start = hhmmToMinutes(windowStart);
  const end = hhmmToMinutes(windowEnd);
  if (start <= end) {
    return current >= start && current <= end;
  }
  return current >= start || current <= end;
}

export function formatTime12h(hhmm: string, timeZone: string, refDate = new Date()): string {
  const { hours, minutes } = parseTimeHHmm(hhmm);
  const d = new Date(refDate);
  d.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function startOfLocalDay(now: Date, timeZone: string): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  return new Date(`${ymd}T00:00:00`);
}

export function daysBitmaskFromList(days: string[]): number {
  const map: Record<string, number> = {
    sun: 1,
    mon: 2,
    tue: 4,
    wed: 8,
    thu: 16,
    fri: 32,
    sat: 64,
    everyday: 127,
    daily: 127,
  };
  if (days.includes("everyday") || days.includes("daily")) return 127;
  return days.reduce((acc, d) => acc | (map[d.toLowerCase().slice(0, 3)] ?? 0), 0) || 127;
}

export function bitmaskToDayNames(mask: number): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names.filter((_, i) => (mask & DAY_BITS[i]) !== 0).join(", ") || "Daily";
}

export { config as defaultTimezone };

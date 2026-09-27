/**
 * Date helpers built around two string formats:
 *   - date keys  "YYYY-MM-DD"  (a calendar day in the user's local time)
 *   - clock times "HH:mm"       (minutes since local midnight)
 *
 * All arithmetic on date keys goes through calendar components (never by
 * adding 86 400 000 ms), which keeps it correct across DST transitions —
 * Egypt, for example, jumps from 00:00 to 01:00 on the last Friday of April.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** Local noon on that day — noon is never skipped or repeated by DST. */
export function dateFromKey(key: string): Date {
  const { y, m, d } = parseDateKey(key);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDateKey(key);
  return toDateKey(new Date(y, m - 1, d + n, 12));
}

/** Whole calendar days from a to b (b - a). DST-independent. */
export function daysBetween(a: string, b: string): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(key: string): number {
  const { y, m, d } = parseDateKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function startOfWeekKey(key: string, weekStartsOn: number): string {
  const diff = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDays(key, -diff);
}

export function rangeKeys(start: string, days: number): string[] {
  return Array.from({ length: Math.max(0, days) }, (_, i) => addDays(start, i));
}

export function keysBetween(start: string, end: string): string[] {
  return rangeKeys(start, daysBetween(start, end) + 1);
}

export function startOfMonthKey(key: string): string {
  return key.slice(0, 8) + "01";
}

export function daysInMonth(key: string): number {
  const { y, m } = parseDateKey(key);
  return new Date(y, m, 0).getDate();
}

export function addMonths(key: string, n: number): string {
  const { y, m } = parseDateKey(key);
  const date = new Date(y, m - 1 + n, 1, 12);
  return toDateKey(date);
}

/* ------------------------------------------------------------------ */
/* Clock times                                                          */
/* ------------------------------------------------------------------ */

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Accepts values beyond 24h (e.g. 1500 → "01:00" next day) and wraps them. */
export function minutesToTime(total: number): string {
  const wrapped = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** Local Date for a date key + clock time (DST gaps resolve forward). */
export function combine(key: string, time: string): Date {
  const { y, m, d } = parseDateKey(key);
  const mins = timeToMinutes(time);
  return new Date(y, m - 1, d, Math.floor(mins / 60), mins % 60, 0, 0);
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * The awake window of a day in minutes since that day's midnight. A bedtime
 * earlier than the wake time (e.g. 00:30) means "after midnight", so the
 * window end is pushed past 1440.
 */
export function awakeWindow(wakeTime: string, bedtime: string): { start: number; end: number } {
  const start = timeToMinutes(wakeTime);
  let end = timeToMinutes(bedtime);
  if (end <= start) end += 1440;
  return { start, end };
}

export function sleepDurationMinutes(bedtime: string, wakeTime: string): number {
  const b = timeToMinutes(bedtime);
  const w = timeToMinutes(wakeTime);
  return w > b ? w - b : w + 1440 - b;
}

export function roundUpTo(minutes: number, step: number): number {
  return Math.ceil(minutes / step) * step;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                           */
/* ------------------------------------------------------------------ */

export function formatMinutes(total: number | null | undefined): string {
  if (total == null || !Number.isFinite(total)) return "—";
  const m = Math.round(total);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function formatClock(time: string, format: "24h" | "12h"): string {
  if (format === "24h") return time;
  const mins = timeToMinutes(time);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function greetingFor(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

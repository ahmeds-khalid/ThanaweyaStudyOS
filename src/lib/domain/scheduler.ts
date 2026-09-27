import type { ActivityType, CalendarEvent, ScheduleBlock } from "../schemas/entities";
import type { Settings } from "../schemas/settings";
import { dayKind } from "./weekly";
import {
  awakeWindow,
  minutesOfDay,
  minutesToTime,
  rangeKeys,
  roundUpTo,
  timeToMinutes,
  todayKey,
  weekdayOf,
} from "./dates";

/* ================================================================== */
/* Shared helpers                                                      */
/* ================================================================== */

export type DayType = "study" | "catchup" | "off";

export const FOCUS_KINDS = new Set(["study", "revision", "catchup", "exam"]);
const INACTIVE_STATUSES = new Set(["skipped", "rescheduled"]);

export function dayType(settings: Settings, date: string): DayType {
  return dayKind(settings, date);
}

/** Occurrences of calendar events on a date (weekly recurrence supported). */
export function eventsOn(events: CalendarEvent[], date: string): CalendarEvent[] {
  return events.filter((e) => {
    if (e.deletedAt) return false;
    if (e.recurrence === "none") return e.date === date;
    if (date < e.date) return false;
    if (e.until && date > e.until) return false;
    return e.weekdays.includes(weekdayOf(date));
  });
}

/** Focused minutes a block contributes to the day's load. */
export function blockFocusMinutes(b: Pick<ScheduleBlock, "kind" | "status" | "durationMinutes">): number {
  return FOCUS_KINDS.has(b.kind) && !INACTIVE_STATUSES.has(b.status) ? b.durationMinutes : 0;
}

export function dayLoadMinutes(blocks: ScheduleBlock[], date: string): number {
  return blocks.filter((b) => b.date === date && !b.deletedAt).reduce((a, b) => a + blockFocusMinutes(b), 0);
}

interface Interval {
  start: number;
  end: number;
}

/** Study window for a day in minutes since midnight (may exceed 1440). */
export function studyWindow(settings: Settings, date: string, now?: Date): Interval | null {
  const awake = awakeWindow(settings.sleep.wakeTime, settings.sleep.bedtime);
  let winStart = timeToMinutes(settings.study.windowStart);
  let winEnd = timeToMinutes(settings.study.windowEnd);
  if (winEnd <= winStart) winEnd += 1440;
  if (winStart < awake.start) winStart = Math.max(winStart, awake.start);
  const start = Math.max(winStart, awake.start);
  const end = Math.min(winEnd, awake.end - settings.scheduler.minFreeMinutesPerDay);
  let s = start;
  if (now && todayKey(now) === date) s = Math.max(s, roundUpTo(minutesOfDay(now), 5));
  return end - s >= 15 ? { start: s, end } : null;
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

function freeIntervals(window: Interval, busy: Interval[]): Interval[] {
  const merged = mergeIntervals(busy);
  const free: Interval[] = [];
  let cursor = window.start;
  for (const b of merged) {
    if (b.end <= cursor) continue;
    if (b.start >= window.end) break;
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free.filter((f) => f.end - f.start >= 5);
}

/** Busy intervals on a date: fixed events, meals, and existing blocks (+break padding around focus blocks). */
function busyIntervals(
  settings: Settings,
  date: string,
  events: CalendarEvent[],
  blocks: ScheduleBlock[],
  excludeBlockId?: string,
): Interval[] {
  const busy: Interval[] = [];
  for (const e of eventsOn(events, date)) {
    if (!e.isFixed) continue;
    const s = timeToMinutes(e.start);
    busy.push({ start: s, end: s + e.durationMinutes });
  }
  for (const m of settings.study.meals) {
    const s = timeToMinutes(m.time);
    busy.push({ start: s, end: s + m.durationMinutes });
  }
  const pad = settings.study.breakMinutes;
  for (const b of blocks) {
    if (b.date !== date || b.deletedAt || b.id === excludeBlockId || INACTIVE_STATUSES.has(b.status)) continue;
    const s = timeToMinutes(b.start);
    const focus = FOCUS_KINDS.has(b.kind);
    busy.push({ start: s - (focus ? pad : 0), end: s + b.durationMinutes + (focus ? pad : 0) });
  }
  return busy;
}

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  explanation: "Explanation",
  practice: "Practice",
  revision: "Revision",
  exam: "Exam",
  mistake_review: "Mistake review",
  reading: "Reading",
  memorization: "Memorization",
  other: "Study",
};

export const activityLabel = (a: ActivityType | null | undefined) => (a ? ACTIVITY_LABEL[a] : "Study");

/* ================================================================== */
/* Single-block rescheduling                                           */
/* ================================================================== */

export interface SlotQuery {
  settings: Settings;
  blocks: ScheduleBlock[];
  events: CalendarEvent[];
  durationMinutes: number;
  now: Date;
  /** Search starts here (default: today). */
  fromDate?: string;
  /** Only consider the catch-up weekday. */
  catchUpOnly?: boolean;
  excludeBlockId?: string;
}

/**
 * Next slot that respects sleep, fixed events, meals, breaks between blocks
 * and the maximum daily load. Never overloads a day to fit the block.
 */
export function findNextSlot(q: SlotQuery): { date: string; start: string } | null {
  const today = todayKey(q.now);
  const from = q.fromDate && q.fromDate > today ? q.fromDate : today;
  const horizon = q.settings.scheduler.rescheduleHorizonDays;
  const blocks = q.blocks.filter((b) => !b.deletedAt && b.id !== q.excludeBlockId);
  for (const d of rangeKeys(from, horizon + 1)) {
    const t = dayType(q.settings, d);
    if (t === "off") continue;
    if (q.catchUpOnly && t !== "catchup") continue;
    const cap = t === "catchup" ? Math.min(q.settings.scheduler.catchUpDayMaxMinutes, q.settings.study.maxDailyMinutes) : q.settings.study.maxDailyMinutes;
    if (dayLoadMinutes(blocks, d) + q.durationMinutes > cap) continue;
    const window = studyWindow(q.settings, d, q.now);
    if (!window) continue;
    const free = freeIntervals(window, busyIntervals(q.settings, d, q.events, blocks));
    const slot = free.find((f) => f.end - f.start >= q.durationMinutes);
    if (slot) return { date: d, start: minutesToTime(slot.start) };
  }
  return null;
}


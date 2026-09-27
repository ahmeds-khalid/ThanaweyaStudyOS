import type { CalendarEvent, DayPriority, Exam, Revision, ScheduleBlock, Subject, Task } from "../schemas/entities";
import type { Settings } from "../schemas/settings";
import { addDays, awakeWindow, combine, daysBetween, minutesToTime, timeToMinutes } from "./dates";
import { FOCUS_KINDS, eventsOn } from "./scheduler";

export type TimelineItem =
  | { type: "block"; start: number; end: number; block: ScheduleBlock }
  | { type: "event"; start: number; end: number; event: CalendarEvent }
  | { type: "meal"; start: number; end: number; name: string }
  | { type: "break"; start: number; end: number }
  | { type: "free"; start: number; end: number }
  | { type: "wake"; start: number; end: number }
  | { type: "sleep"; start: number; end: number };

/**
 * The day's timeline. Only study/manual blocks are stored; wake-up, meals,
 * breaks, free time and bedtime are derived from settings so editing a meal
 * time or bedtime updates every day immediately.
 */
export function buildTimeline(settings: Settings, date: string, blocks: ScheduleBlock[], events: CalendarEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const awake = awakeWindow(settings.sleep.wakeTime, settings.sleep.bedtime);
  items.push({ type: "wake", start: awake.start, end: awake.start });
  for (const m of settings.study.meals) {
    const s = timeToMinutes(m.time);
    items.push({ type: "meal", start: s, end: s + m.durationMinutes, name: m.name });
  }
  for (const e of eventsOn(events, date)) {
    const s = timeToMinutes(e.start);
    items.push({ type: "event", start: s, end: s + e.durationMinutes, event: e });
  }
  const dayBlocks = blocks
    .filter((b) => b.date === date && !b.deletedAt)
    .sort((a, b) => a.start.localeCompare(b.start));
  for (const b of dayBlocks) {
    const s = timeToMinutes(b.start);
    items.push({ type: "block", start: s, end: s + b.durationMinutes, block: b });
  }
  // Breaks: short gaps between consecutive focus blocks.
  const focus = dayBlocks.filter((b) => FOCUS_KINDS.has(b.kind) && b.status !== "rescheduled");
  for (let i = 1; i < focus.length; i++) {
    const prevEnd = timeToMinutes(focus[i - 1].start) + focus[i - 1].durationMinutes;
    const nextStart = timeToMinutes(focus[i].start);
    const gap = nextStart - prevEnd;
    const occupied = items.some((it) => it.type !== "block" && it.type !== "wake" && it.start < nextStart && it.end > prevEnd);
    if (gap > 0 && gap <= Math.max(settings.study.breakMinutes * 2, 30) && !occupied) {
      items.push({ type: "break", start: prevEnd, end: nextStart });
    }
  }
  // Free time: from the end of the last focus block to bedtime.
  const lastFocusEnd = focus.length ? Math.max(...focus.map((b) => timeToMinutes(b.start) + b.durationMinutes)) : null;
  if (lastFocusEnd != null && awake.end - lastFocusEnd >= 30) {
    items.push({ type: "free", start: lastFocusEnd, end: awake.end });
  }
  items.push({ type: "sleep", start: awake.end, end: awake.end });
  const order: Record<TimelineItem["type"], number> = { wake: 0, meal: 1, event: 1, block: 2, break: 3, free: 4, sleep: 5 };
  return items.sort((a, b) => a.start - b.start || order[a.type] - order[b.type]);
}

export const timeLabel = (minutes: number) => minutesToTime(minutes);

/* ------------------------------------------------------------------ */
/* Block status                                                         */
/* ------------------------------------------------------------------ */

export type EffectiveStatus = ScheduleBlock["status"] | "overdue";

/** "Overdue" is derived: an upcoming block whose end time has passed. */
export function effectiveStatus(b: ScheduleBlock, now: Date): EffectiveStatus {
  if (b.status !== "upcoming") return b.status;
  const end = combine(b.date, b.start).getTime() + b.durationMinutes * 60_000;
  return end < now.getTime() ? "overdue" : "upcoming";
}

/** Planned start minus actual start, in minutes (positive = late). */
export function startDelayMinutes(b: ScheduleBlock, startedAt: Date): number {
  return Math.round((startedAt.getTime() - combine(b.date, b.start).getTime()) / 60_000);
}

/* ------------------------------------------------------------------ */
/* Must / Should / Optional                                            */
/* ------------------------------------------------------------------ */

export const PRIORITY_RULES = [
  "Must: exams or tests, subjects with priority 5, subjects with an exam within 3 days, overdue revisions, and high/critical tasks that are due or overdue.",
  "Optional: subjects with priority 1–2, revisions that are not due yet, and low-priority tasks.",
  "Should: everything else.",
  "Any item can be overridden manually.",
];

export function blockPriority(b: ScheduleBlock, subject: Subject | undefined, exams: Exam[], today: string): DayPriority {
  if (b.priority) return b.priority;
  if (b.kind === "exam" || b.activity === "exam") return "must";
  if (subject) {
    if (subject.priority >= 5) return "must";
    const upcoming = exams.some(
      (e) => !e.deletedAt && e.subjectId === subject.id && e.status !== "completed" && e.date >= today && daysBetween(today, e.date) <= 3,
    );
    const subjectExamSoon = subject.examDate && subject.examDate >= today && daysBetween(today, subject.examDate) <= 3;
    if (upcoming || subjectExamSoon) return "must";
    if (subject.priority <= 2) return "optional";
  }
  return "should";
}

export function taskPriority(t: Task, today: string): DayPriority {
  const due = t.dueDate != null && t.dueDate <= today;
  if ((t.priority === "critical" || t.priority === "high") && due) return "must";
  if (t.priority === "critical") return "must";
  if (t.priority === "low") return "optional";
  return due ? "should" : "optional";
}

export function revisionPriority(r: Revision, today: string): DayPriority {
  if (r.scheduledDate < today) return "must";
  if (r.scheduledDate === today) return "should";
  return "optional";
}

export function isTaskForDay(t: Task, today: string): boolean {
  if (t.deletedAt || t.status === "completed" || t.status === "archived") return false;
  if (t.status === "today" || t.status === "in_progress") return true;
  return t.dueDate != null && t.dueDate <= addDays(today, 0);
}

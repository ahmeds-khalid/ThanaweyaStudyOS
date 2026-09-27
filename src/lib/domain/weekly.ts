import type { Lesson, ScheduleBlock, Subject } from "../schemas/entities";
import type { PlanDay, PlanSlot, Settings } from "../schemas/settings";
import { minutesToTime, rangeKeys, timeToMinutes, weekdayOf } from "./dates";

/**
 * The weekly routine → concrete days.
 *
 * The routine lives in `settings.weeklyPlan` (Sunday = 0 … Saturday = 6). A day is
 * produced by `expandDay`; nothing is stored for a future day until the student
 * touches it. A block that has been stored (started, moved, skipped, edited…)
 * has the id `wk:<slotId>:<original date>`, so the generator can always tell
 * that "this occurrence already exists" — even after it has been moved to another
 * date. That is what makes a one-off change leave the weekly routine untouched.
 */

export type DayKind = "study" | "catchup" | "off";

/** A generated block. `virtual` ones exist only in memory (nothing saved yet). */
export type Occurrence = ScheduleBlock & { virtual?: boolean };

export type BlockFields = Omit<ScheduleBlock, "id" | "createdAt" | "updatedAt" | "deletedAt">;
export type Draft = BlockFields & { id: string };

/** Marks a generated block the routine no longer contains (kept so it can come back). */
export const PLAN_REMOVED = "[plan-removed]";

export const occurrenceId = (slotId: string, date: string) => `wk:${slotId}:${date}`;
export const isPlanBlockId = (id: string) => id.startsWith("wk:");

/* ------------------------------------------------------------------ */
/* Day kind                                                             */
/* ------------------------------------------------------------------ */

export function dayKind(settings: Settings, date: string): DayKind {
  if (settings.study.daysOff.includes(date)) return "off";
  const wd = weekdayOf(date);
  const plan = settings.weeklyPlan;
  if (!plan.configured) {
    if (settings.study.catchUpDay === wd) return "catchup";
    return settings.study.studyDays.includes(wd) ? "study" : "off";
  }
  if (plan.endsOn && date > plan.endsOn) return "off";
  const day = plan.days[wd];
  if (day.off) return "off";
  return day.catchUp ? "catchup" : "study";
}

/* ------------------------------------------------------------------ */
/* Placing a day's slots in time                                        */
/* ------------------------------------------------------------------ */

interface Span {
  start: number;
  end: number;
}

/**
 * Start times for a day's slots. Slots with a preferred time keep it. The rest are
 * placed one after another from the start of the study window, leaving the break
 * between them and stepping around meals and fixed-time slots.
 */
export function placeSlots(settings: Settings, slots: PlanSlot[]): number[] {
  const brk = settings.study.breakMinutes;
  const meals: Span[] = settings.study.meals.map((m) => ({ start: timeToMinutes(m.time), end: timeToMinutes(m.time) + m.durationMinutes }));
  const fixed: Span[] = slots.filter((s) => s.start != null).map((s) => ({ start: timeToMinutes(s.start!), end: timeToMinutes(s.start!) + s.durationMinutes }));
  const busy = [...meals, ...fixed].sort((a, b) => a.start - b.start);
  let cursor = timeToMinutes(settings.study.windowStart);
  return slots.map((slot) => {
    if (slot.start != null) return timeToMinutes(slot.start);
    for (let guard = 0; guard < 50; guard++) {
      const hit = busy.find((b) => b.start < cursor + slot.durationMinutes && b.end > cursor);
      if (!hit) break;
      cursor = hit.end + (fixed.includes(hit) ? brk : 0);
    }
    const start = Math.max(0, Math.min(cursor, 24 * 60 - slot.durationMinutes));
    cursor = start + slot.durationMinutes + brk;
    return start;
  });
}

/* ------------------------------------------------------------------ */
/* Expanding the routine                                                */
/* ------------------------------------------------------------------ */

function slotIsUsable(slot: PlanSlot, subjects: Map<string, Subject>): boolean {
  if (slot.kind !== "study") return true;
  const s = slot.subjectId ? subjects.get(slot.subjectId) : undefined;
  return !!s && s.enabled && !s.archived && !s.deletedAt;
}

const KIND_TITLE: Record<PlanSlot["kind"], string> = { study: "", revision: "Weekly revision", catchup: "Catch-up" };

/** The blocks the routine wants on `date` (no stored data is consulted). */
export function expandDay(settings: Settings, date: string, subjects: Map<string, Subject>): Draft[] {
  const kind = dayKind(settings, date);
  if (kind === "off" || !settings.weeklyPlan.configured) return [];
  const usable = settings.weeklyPlan.days[weekdayOf(date)].slots.filter((s) => slotIsUsable(s, subjects));
  const starts = placeSlots(settings, usable);
  return usable
    .map((slot, i): Draft => ({
      id: occurrenceId(slot.id, date),
      isDemo: false,
      date,
      start: minutesToTime(starts[i]),
      durationMinutes: slot.durationMinutes,
      kind: slot.kind,
      title: KIND_TITLE[slot.kind],
      subjectId: slot.kind === "study" ? slot.subjectId : null,
      lessonId: null,
      activity: slot.kind === "revision" ? "revision" : null,
      priority: null,
      status: "upcoming",
      source: "generated",
      sessionId: null,
      backlogId: null,
      locked: false,
      notes: "",
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

const asVirtual = (d: Draft): Occurrence => ({ ...d, createdAt: "", updatedAt: "", deletedAt: null, virtual: true }) as unknown as Occurrence;

/**
 * Stored blocks plus the routine's not-yet-stored blocks for `from … from+days-1`, sorted by
 * start. Blocks that were rescheduled away are left out.
 */
export function occurrencesBetween(settings: Settings, from: string, days: number, subjects: Map<string, Subject>, blocks: ScheduleBlock[]): Map<string, Occurrence[]> {
  const known = new Set(blocks.map((b) => b.id));
  const byDate = new Map<string, Occurrence[]>();
  for (const d of rangeKeys(from, days)) byDate.set(d, []);
  for (const b of blocks) {
    if (b.deletedAt || b.status === "rescheduled") continue;
    byDate.get(b.date)?.push(b);
  }
  for (const d of byDate.keys()) {
    for (const draft of expandDay(settings, d, subjects)) if (!known.has(draft.id)) byDate.get(d)!.push(asVirtual(draft));
    byDate.get(d)!.sort((a, b) => a.start.localeCompare(b.start));
  }
  return byDate;
}

/* ------------------------------------------------------------------ */
/* Building the routine from the subjects' weekly targets               */
/* ------------------------------------------------------------------ */

export interface DefaultPlanResult {
  days: PlanDay[];
  /** Weekly sessions that did not fit into the study days' capacity. */
  dropped: number;
}

/**
 * A starting routine from each subject's priority and sessions per week: higher
 * priority first, a subject never twice on the same day, sessions spread across
 * the week, and the catch-up day kept for catching up.
 */
export function defaultWeeklyPlan(settings: Settings, subjects: Subject[], makeId: () => string): DefaultPlanResult {
  const st = settings.study;
  const days: PlanDay[] = Array.from({ length: 7 }, (_, wd) => ({
    off: wd !== st.catchUpDay && !st.studyDays.includes(wd),
    catchUp: wd === st.catchUpDay,
    slots: [],
  }));
  const studyDays = days.map((d, wd) => (!d.off && !d.catchUp ? wd : -1)).filter((wd) => wd >= 0);
  const capacity = Math.max(1, st.blocksPerDay);
  const list = subjects
    .filter((s) => s.enabled && !s.archived && !s.deletedAt && s.weeklySessions > 0)
    .sort((a, b) => b.priority - a.priority || b.difficulty - a.difficulty || a.order - b.order);

  const placed = new Map<string, number[]>();
  let dropped = 0;
  const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
  // Round-robin so that when time is short every subject loses a session before one loses all.
  const maxSessions = Math.max(0, ...list.map((s) => s.weeklySessions));
  for (let round = 0; round < maxSessions; round++) {
    for (const subject of list) {
      if (round >= subject.weeklySessions) continue;
      const mine = placed.get(subject.id) ?? [];
      const options = studyDays.filter((wd) => days[wd].slots.length < capacity && !mine.includes(wd));
      if (options.length === 0) {
        dropped++;
        continue;
      }
      const load = (wd: number) => days[wd].slots.length;
      const spread = (wd: number) => (mine.length ? Math.min(...mine.map((m) => dist(m, wd))) : 0);
      options.sort((a, b) => load(a) - load(b) || spread(b) - spread(a) || a - b);
      const wd = options[0];
      days[wd].slots.push({ id: makeId(), kind: "study", subjectId: subject.id, start: null, durationMinutes: st.blockMinutes });
      placed.set(subject.id, [...mine, wd]);
    }
  }
  const rank = new Map(list.map((s, i) => [s.id, i]));
  for (const d of days) {
    if (st.hardFirst) d.slots.sort((a, b) => (rank.get(a.subjectId ?? "") ?? 99) - (rank.get(b.subjectId ?? "") ?? 99));
  }
  for (const d of days) {
    if (!d.catchUp) continue;
    if (settings.scheduler.revisionBlocks) d.slots.push({ id: makeId(), kind: "revision", subjectId: null, start: null, durationMinutes: Math.max(30, settings.scheduler.revisionBlockMinutes) });
    d.slots.push({ id: makeId(), kind: "catchup", subjectId: null, start: null, durationMinutes: st.blockMinutes });
  }
  return { days, dropped };
}

/* ------------------------------------------------------------------ */
/* Curriculum-aware lessons                                             */
/* ------------------------------------------------------------------ */

/**
 * The lesson a study block should continue with: the first lesson (in curriculum
 * order) that is not completed and is not already the plan for an earlier block.
 */
export function nextFreeLesson(ordered: Lesson[], taken: Set<string>): Lesson | null {
  return ordered.find((l) => l.status !== "completed" && !taken.has(l.id)) ?? null;
}

/** "Explanation" for a lesson not yet started, otherwise "practice". */
export function activityForLesson(lesson: Lesson | null): ScheduleBlock["activity"] {
  if (!lesson) return null;
  return lesson.status === "not_started" ? "explanation" : "practice";
}

/** Total planned study minutes per weekday of the routine (for the summary line). */
export function weeklyMinutes(days: PlanDay[]): number {
  return days.reduce((sum, d) => (d.off ? sum : sum + d.slots.filter((s) => s.kind === "study").reduce((a, s) => a + s.durationMinutes, 0)), 0);
}


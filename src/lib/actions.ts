"use client";

import { buildCurriculumIndex } from "./domain/curriculum";
import { addDays, rangeKeys, todayKey, weekdayOf } from "./domain/dates";
import { nextReview, firstReview, ladderDates } from "./domain/revision";
import { findNextSlot } from "./domain/scheduler";
import { activityForLesson, defaultWeeklyPlan, expandDay, isPlanBlockId, nextFreeLesson, PLAN_REMOVED, type Draft, type Occurrence } from "./domain/weekly";
import type { PlanDay } from "./schemas/settings";
import { uid } from "./utils";
import type { BacklogItem, Lesson, Mistake, Revision, ScheduleBlock, Task } from "./schemas/entities";
import { db } from "./store/data";
import { toast } from "./store/toast";

/* ------------------------------------------------------------------ */
/* Weekly routine → stored blocks                                       */
/* ------------------------------------------------------------------ */

const SYNC_DAYS = 14;

const subjectMap = () => new Map(db.list("subjects").map((x) => [x.id, x]));

/** Store a block that so far only exists as part of the routine. Returns the stored block. */
export function materialize(occ: Occurrence): ScheduleBlock {
  if (!occ.virtual) return occ;
  const { virtual: _v, id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...fields } = occ;
  void _v;
  void _c;
  void _u;
  void _d;
  return db.create("scheduleBlocks", fields, id);
}

/**
 * Keeps the next two weeks stored, generated from the weekly routine. Idempotent: it only
 * writes what is missing or out of date, never touches blocks you started, completed,
 * skipped, edited or moved, and links each study block to the lesson it continues with.
 */
export function syncWeeklyPlan(now = new Date()) {
  const settings = db.settings();
  if (!settings.weeklyPlan.configured) return;
  const today = todayKey(now);
  const subjects = subjectMap();
  const blocks = db.list("scheduleBlocks").filter((x) => !x.deletedAt);
  const byId = new Map(blocks.map((x) => [x.id, x]));
  const untouched = (x: ScheduleBlock) => x.source === "generated" && x.status === "upcoming" && !x.locked;

  // Blocks made by the old automatic planner are replaced by the routine.
  for (const x of blocks) if (!isPlanBlockId(x.id) && untouched(x) && x.date >= today) db.remove("scheduleBlocks", x.id, { silent: true });

  const desired = new Map<string, Draft>();
  for (const date of rangeKeys(today, SYNC_DAYS)) for (const d of expandDay(settings, date, subjects)) desired.set(d.id, d);

  for (const x of blocks) {
    if (!isPlanBlockId(x.id) || x.date < today || !untouched(x) || desired.has(x.id)) continue;
    // The routine no longer contains it (slot removed, day off, subject disabled). Hidden, not deleted, so it can return.
    db.update("scheduleBlocks", x.id, { status: "rescheduled", notes: PLAN_REMOVED });
  }

  for (const d of desired.values()) {
    const cur = byId.get(d.id);
    if (!cur) {
      const { id, ...fields } = d;
      db.create("scheduleBlocks", fields, id);
    } else if (cur.source === "generated" && cur.notes === PLAN_REMOVED) {
      db.update("scheduleBlocks", cur.id, { status: "upcoming", notes: "", start: d.start, durationMinutes: d.durationMinutes });
    } else if (untouched(cur) && (cur.start !== d.start || cur.durationMinutes !== d.durationMinutes || cur.subjectId !== d.subjectId || cur.kind !== d.kind)) {
      db.update("scheduleBlocks", cur.id, { start: d.start, durationMinutes: d.durationMinutes, subjectId: d.subjectId, kind: d.kind });
    }
  }

  // Curriculum: each study block continues from where the student is.
  const idx = buildCurriculumIndex(db.list("units"), db.list("chapters"), db.list("lessons"));
  const fresh = db.list("scheduleBlocks").filter((x) => !x.deletedAt && x.status !== "rescheduled");
  const taken = new Map<string, Set<string>>();
  const takeBy = (subjectId: string) => taken.get(subjectId) ?? taken.set(subjectId, new Set()).get(subjectId)!;
  for (const x of fresh) if (x.subjectId && x.lessonId && x.date >= today && !(untouched(x) && isPlanBlockId(x.id))) takeBy(x.subjectId).add(x.lessonId);
  const mine = fresh.filter((x) => isPlanBlockId(x.id) && untouched(x) && x.kind === "study" && x.subjectId && x.date >= today).sort((p, q) => p.date.localeCompare(q.date) || p.start.localeCompare(q.start));
  for (const x of mine) {
    const set = takeBy(x.subjectId!);
    const lesson = nextFreeLesson(idx.orderedLessonsBySubject.get(x.subjectId!) ?? [], set);
    if (lesson) set.add(lesson.id);
    const lessonId = lesson?.id ?? null;
    const activity = activityForLesson(lesson);
    if (x.lessonId !== lessonId || x.activity !== activity) db.update("scheduleBlocks", x.id, { lessonId, activity });
  }
}

/** Saves the weekly routine and keeps the legacy study-day settings in step with it. */
export function saveWeeklyPlan(days: PlanDay[], extra: { endsOn?: string | null } = {}) {
  const study = { studyDays: days.map((d, i) => (!d.off && !d.catchUp ? i : -1)).filter((i) => i >= 0), catchUpDay: days.findIndex((d) => d.catchUp) };
  db.updateSettings({
    weeklyPlan: { configured: true, days, ...(extra.endsOn !== undefined ? { endsOn: extra.endsOn } : {}) },
    study: { studyDays: study.studyDays, catchUpDay: study.catchUpDay < 0 ? null : study.catchUpDay },
  });
}

/** Rebuild the routine from each subject's priority and weekly sessions. Returns how many sessions did not fit. */
export function regenerateWeeklyPlan(): number {
  const { days, dropped } = defaultWeeklyPlan(db.settings(), db.list("subjects"), () => uid().slice(0, 8));
  saveWeeklyPlan(days);
  return dropped;
}

/** Turn today's generated-but-unsaved blocks into stored ones so they can be started. */
export function materializeAll(list: Occurrence[]): ScheduleBlock[] {
  return list.map(materialize);
}

/* ------------------------------------------------------------------ */
/* Missed / unfinished blocks                                           */
/* ------------------------------------------------------------------ */

/** Move a block to the next suitable slot (respecting daily limits). */
export function rescheduleBlock(block: ScheduleBlock, opts: { catchUpOnly?: boolean } = {}): boolean {
  const slot = findNextSlot({
    settings: db.settings(),
    blocks: db.list("scheduleBlocks"),
    events: db.list("calendarEvents"),
    durationMinutes: block.durationMinutes,
    now: new Date(),
    excludeBlockId: block.id,
    catchUpOnly: opts.catchUpOnly,
  });
  if (!slot) {
    toast.warning(
      "No free slot found",
      `Nothing fits in the next ${db.settings().scheduler.rescheduleHorizonDays} days without exceeding your daily limit. Try moving it to the backlog.`,
    );
    return false;
  }
  const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...fields } = block;
  void _id;
  void _c;
  void _u;
  void _d;
  db.create("scheduleBlocks", {
    ...fields,
    date: slot.date,
    start: slot.start,
    status: "upcoming",
    source: "manual",
    sessionId: null,
    notes: `Rescheduled from ${block.date} ${block.start}${fields.notes ? ` · ${fields.notes}` : ""}`,
  });
  db.update("scheduleBlocks", block.id, { status: "rescheduled" });
  toast.success("Rescheduled", `${block.title || "Block"} → ${slot.date === todayKey() ? "today" : slot.date} at ${slot.start}`);
  return true;
}

/**
 * Turn a missed block into a backlog item and try to place it on the next
 * catch-up day (or any day with spare capacity). Never overloads a day.
 */
export function moveToCatchUp(block: ScheduleBlock): void {
  const subject = db.get("subjects", block.subjectId);
  const item = db.create("backlogItems", {
    subjectId: block.subjectId,
    lessonId: block.lessonId,
    title: block.title || "Missed study block",
    activity: block.activity,
    estimatedMinutes: Math.min(600, Math.max(5, block.durationMinutes)),
    importance: subject?.priority ?? 3,
    sourceBlockId: block.id,
  });
  db.update("scheduleBlocks", block.id, { status: "rescheduled" });
  placeBacklogItem(item);
}

export function placeBacklogItem(item: BacklogItem): boolean {
  const settings = db.settings();
  const common = {
    settings,
    blocks: db.list("scheduleBlocks"),
    events: db.list("calendarEvents"),
    durationMinutes: item.estimatedMinutes,
    now: new Date(),
  };
  const slot = findNextSlot({ ...common, catchUpOnly: settings.study.catchUpDay != null }) ?? findNextSlot(common);
  if (!slot || (item.deadline && slot.date > item.deadline)) {
    toast.warning("Added to backlog", "No slot fits within your limits yet. It will be placed when you regenerate the plan or free up time.");
    return false;
  }
  const block = db.create("scheduleBlocks", {
    date: slot.date,
    start: slot.start,
    durationMinutes: item.estimatedMinutes,
    kind: "catchup",
    title: `Catch-up — ${item.title}`,
    subjectId: item.subjectId,
    lessonId: item.lessonId,
    activity: item.activity,
    source: "backlog",
    backlogId: item.id,
  });
  db.update("backlogItems", item.id, { status: "scheduled", scheduledBlockId: block.id });
  const wd = weekdayOf(slot.date);
  const label = settings.study.catchUpDay === wd ? "the catch-up day" : slot.date;
  toast.success("Moved to catch-up", `Placed on ${label} at ${slot.start}.`);
  return true;
}

export function skipBlock(block: ScheduleBlock) {
  db.update("scheduleBlocks", block.id, { status: "skipped" });
  toast.withAction("Block skipped", { label: "Undo", onClick: () => db.update("scheduleBlocks", block.id, { status: block.status }) });
}

/* ------------------------------------------------------------------ */
/* Lessons                                                              */
/* ------------------------------------------------------------------ */

export function completeLesson(lesson: Lesson) {
  db.update("lessons", lesson.id, {
    status: "completed",
    stage: "completed",
    completion: 100,
    completedAt: lesson.completedAt ?? new Date().toISOString(),
    startedAt: lesson.startedAt ?? new Date().toISOString(),
  });
}

/** Schedule revision(s) for a lesson: either one rung of the ladder or the whole ladder. */
export function scheduleLessonRevisions(lesson: Lesson, choice: { step: number } | "ladder", from = todayKey()) {
  const cfg = db.settings().revision;
  const dates = choice === "ladder" ? ladderDates(from, cfg) : [firstReview(from, choice.step, cfg)];
  for (const d of dates) {
    db.create("revisions", {
      subjectId: lesson.subjectId,
      lessonId: lesson.id,
      title: lesson.title,
      type: cfg.defaultType,
      scheduledDate: d.date,
      durationMinutes: cfg.defaultDurationMinutes,
      step: d.step,
    });
  }
  db.update("lessons", lesson.id, { stage: "revision_scheduled" });
  toast.success(
    dates.length === 1 ? "Revision scheduled" : `${dates.length} revisions scheduled`,
    dates.map((d) => d.date).join(", "),
  );
}

/* ------------------------------------------------------------------ */
/* Revisions & mistakes                                                 */
/* ------------------------------------------------------------------ */

/** Record a revision result and schedule the next one from the rating. */
export function completeRevision(rev: Revision, rating: number, opts: { scheduleNext: boolean } = { scheduleNext: true }) {
  const today = todayKey();
  db.update("revisions", rev.id, { status: "done", rating, completedAt: new Date().toISOString() });
  if (rev.mistakeId) {
    const m = db.get("mistakes", rev.mistakeId);
    if (m) reviewMistake(m, rating, { silent: true });
    return;
  }
  if (!opts.scheduleNext) return;
  const next = nextReview(today, rev.step, rating, db.settings().revision);
  const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, ...fields } = rev;
  void _i;
  void _c;
  void _u;
  void _d;
  db.create("revisions", { ...fields, status: "pending", rating: null, completedAt: null, scheduledDate: next.date, step: next.step, notes: "" });
  if (rev.lessonId && rating <= 2) {
    const lesson = db.get("lessons", rev.lessonId);
    if (lesson && lesson.status === "completed") db.update("lessons", lesson.id, { status: "needs_review" });
  }
  toast.success("Revision logged", `Next review in ${next.intervalDays} day${next.intervalDays === 1 ? "" : "s"} (${next.date}).`);
}

export function reviewMistake(m: Mistake, rating: number, opts: { silent?: boolean } = {}) {
  const today = todayKey();
  const next = nextReview(today, m.step, rating, db.settings().revision);
  db.update("mistakes", m.id, {
    reviewHistory: [...m.reviewHistory, { date: today, rating }],
    step: next.step,
    nextReviewDate: next.date,
    resolved: m.resolved,
  });
  if (!opts.silent) toast.success("Review saved", `Next review on ${next.date}.`);
}

/* ------------------------------------------------------------------ */
/* Tasks                                                                */
/* ------------------------------------------------------------------ */

function nextDue(task: Task): string | null {
  const base = task.dueDate ?? todayKey();
  const settings = db.settings();
  switch (task.recurrence) {
    case "daily":
      return addDays(base, 1);
    case "weekdays": {
      let d = addDays(base, 1);
      for (let i = 0; i < 7 && !settings.study.studyDays.includes(weekdayOf(d)); i++) d = addDays(d, 1);
      return d;
    }
    case "weekly":
      return addDays(base, 7);
    case "monthly": {
      const [y, mo, day] = base.split("-").map(Number);
      const dt = new Date(y, mo, Math.min(day, new Date(y, mo + 1, 0).getDate()), 12);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    }
    default:
      return null;
  }
}

export function setTaskDone(task: Task, done: boolean) {
  if (!done) {
    db.update("tasks", task.id, { status: "today", completedAt: null });
    return;
  }
  db.update("tasks", task.id, { status: "completed", completedAt: new Date().toISOString() });
  if (task.recurrence !== "none") {
    const due = nextDue(task);
    const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, ...fields } = task;
    void _i;
    void _c;
    void _u;
    void _d;
    db.create("tasks", {
      ...fields,
      status: "scheduled",
      completedAt: null,
      dueDate: due,
      subtasks: fields.subtasks.map((s) => ({ ...s, done: false })),
    });
    toast.success("Done — next one scheduled", due ? `Due ${due}` : undefined);
  } else {
    toast.withAction("Task completed", { label: "Undo", onClick: () => db.update("tasks", task.id, { status: task.status, completedAt: null }) });
  }
}

/* ------------------------------------------------------------------ */
/* Acting on a day's blocks (stored or not yet stored)                  */
/* ------------------------------------------------------------------ */

export function completeBlock(occ: Occurrence) {
  const b = materialize(occ);
  db.update("scheduleBlocks", b.id, { status: "completed" });
  if (b.backlogId) db.update("backlogItems", b.backlogId, { status: "done" });
}

export function skipOccurrence(occ: Occurrence) {
  skipBlock(materialize(occ));
}

export function rescheduleOccurrence(occ: Occurrence) {
  return rescheduleBlock(materialize(occ));
}

export function moveOccurrenceToCatchUp(occ: Occurrence) {
  moveToCatchUp(materialize(occ));
}

export function reopenBlock(occ: Occurrence) {
  db.update("scheduleBlocks", materialize(occ).id, { status: "upcoming" });
}

/** Mark one date as a day off (or bring it back). The weekly routine itself is not changed. */
export function setDayOff(date: string, off: boolean) {
  const cur = db.settings().study.daysOff;
  const next = off ? [...new Set([...cur, date])].sort() : cur.filter((d) => d !== date);
  db.updateSettings({ study: { daysOff: next } });
}

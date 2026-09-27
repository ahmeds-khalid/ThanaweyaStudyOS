import { describe, expect, it } from "vitest";
import type { PlanDay, PlanSlot } from "../schemas/settings";
import { row, settings as makeSettings, subject } from "./fixtures.test-helpers";
import { dayKind, defaultWeeklyPlan, expandDay, nextFreeLesson, occurrenceId, occurrencesBetween, placeSlots } from "./weekly";

// 2026-09-28 is a Monday (weekday 1); 2026-10-02 is a Friday (5).
const MON = "2026-09-28";
const FRI = "2026-10-02";

const slot = (id: string, subjectId: string | null, patch: Partial<PlanSlot> = {}): PlanSlot => ({
  id,
  kind: "study",
  subjectId,
  start: null,
  durationMinutes: 90,
  ...patch,
});

function withMonday(slots: PlanSlot[], extra: Record<string, unknown> = {}) {
  const days: PlanDay[] = Array.from({ length: 7 }, () => ({ off: false, catchUp: false, slots: [] }));
  days[1] = { off: false, catchUp: false, slots };
  return makeSettings({ weeklyPlan: { configured: true, days, endsOn: null }, ...extra });
}

const math = subject("Math");
const physics = subject("Physics");
const subjects = new Map([math, physics].map((s) => [s.id, s]));

describe("placeSlots", () => {
  it("stacks automatic slots from the window start with a break in between", () => {
    const s = makeSettings({ study: { windowStart: "16:00", breakMinutes: 30, meals: [] } });
    expect(placeSlots(s, [slot("a", "x"), slot("b", "y")])).toEqual([16 * 60, 16 * 60 + 120]);
  });

  it("keeps a preferred time and steps around it and around meals", () => {
    const s = makeSettings({ study: { windowStart: "16:00", breakMinutes: 20, meals: [{ id: "d", name: "Dinner", time: "17:45", durationMinutes: 45 }] } });
    const starts = placeSlots(s, [slot("a", "x", { start: "20:00" }), slot("b", "y"), slot("c", "z")]);
    expect(starts[0]).toBe(20 * 60);
    expect(starts[1]).toBe(16 * 60); // 16:00–17:30 ends before dinner
    expect(starts[2]).toBe(18 * 60 + 30); // pushed past dinner (ends 18:30)
  });
});

describe("expandDay", () => {
  it("produces the weekday's blocks with deterministic ids", () => {
    const s = withMonday([slot("m1", math.id, { start: "16:00" }), slot("p1", physics.id, { start: "18:00" })]);
    const drafts = expandDay(s, MON, subjects);
    expect(drafts.map((d) => [d.id, d.start, d.subjectId])).toEqual([
      [occurrenceId("m1", MON), "16:00", math.id],
      [occurrenceId("p1", MON), "18:00", physics.id],
    ]);
    expect(expandDay(s, "2026-10-05", subjects).map((d) => d.start)).toEqual(["16:00", "18:00"]); // every Monday
  });

  it("skips disabled subjects, days off, catch-up-free days and dates after the end", () => {
    const off = subject("Off", { enabled: false });
    const s = withMonday([slot("a", off.id), slot("b", math.id)]);
    const map = new Map([[off.id, off], ...subjects]);
    expect(expandDay(s, MON, map)).toHaveLength(1);
    expect(expandDay({ ...s, study: { ...s.study, daysOff: [MON] } }, MON, map)).toEqual([]);
    expect(expandDay({ ...s, weeklyPlan: { ...s.weeklyPlan, endsOn: "2026-09-27" } }, MON, map)).toEqual([]);
  });

  it("generates nothing until the routine is configured", () => {
    expect(expandDay(makeSettings(), MON, subjects)).toEqual([]);
  });
});

describe("dayKind", () => {
  it("follows the routine, with dates off on top", () => {
    const s = withMonday([]);
    s.weeklyPlan.days[5] = { off: false, catchUp: true, slots: [] };
    s.weeklyPlan.days[6] = { off: true, catchUp: false, slots: [] };
    expect(dayKind(s, MON)).toBe("study");
    expect(dayKind(s, FRI)).toBe("catchup");
    expect(dayKind(s, "2026-10-03")).toBe("off");
    expect(dayKind({ ...s, study: { ...s.study, daysOff: [MON] } }, MON)).toBe("off");
  });
});

describe("occurrencesBetween — specific-date overrides", () => {
  const s = withMonday([slot("m1", math.id, { start: "16:00" })]);

  it("shows the routine's block for a future Monday without storing anything", () => {
    const map = occurrencesBetween(s, MON, 1, subjects, []);
    const list = map.get(MON)!;
    expect(list).toHaveLength(1);
    expect(list[0].virtual).toBe(true);
  });

  it("a stored, moved block replaces only that date; the routine stays", () => {
    const moved = row("scheduleBlocks", { id: occurrenceId("m1", MON), date: MON, start: "18:00", subjectId: math.id, source: "manual" });
    const map = occurrencesBetween(s, MON, 8, subjects, [moved]);
    expect(map.get(MON)!.map((b) => [b.start, b.virtual ?? false])).toEqual([["18:00", false]]);
    expect(map.get("2026-10-05")!.map((b) => [b.start, b.virtual ?? false])).toEqual([["16:00", true]]);
  });

  it("a block moved to another date does not come back on its original date", () => {
    const moved = row("scheduleBlocks", { id: occurrenceId("m1", MON), date: "2026-09-29", start: "10:00", subjectId: math.id, source: "manual" });
    const map = occurrencesBetween(s, MON, 3, subjects, [moved]);
    expect(map.get(MON)).toEqual([]);
    expect(map.get("2026-09-29")).toHaveLength(1);
  });

  it("hides blocks that were rescheduled away", () => {
    const gone = row("scheduleBlocks", { id: occurrenceId("m1", MON), date: MON, status: "rescheduled", subjectId: math.id });
    expect(occurrencesBetween(s, MON, 1, subjects, [gone]).get(MON)).toEqual([]);
  });
});

describe("defaultWeeklyPlan", () => {
  let n = 0;
  const makeId = () => `s${++n}`;
  const s = makeSettings({ study: { studyDays: [6, 0, 1, 2, 3, 4], catchUpDay: 5, blocksPerDay: 3, blockMinutes: 90 } });

  it("respects weekly session targets, priorities and one session per subject per day", () => {
    const list = [
      subject("Math", { priority: 5, weeklySessions: 3, order: 0 }),
      subject("Physics", { priority: 4, weeklySessions: 2, order: 1 }),
      subject("Arabic", { priority: 3, weeklySessions: 2, order: 2 }),
      subject("English", { priority: 1, weeklySessions: 1, order: 3 }),
    ];
    const { days, dropped } = defaultWeeklyPlan(s, list, makeId);
    expect(dropped).toBe(0);
    const count = (id: string) => days.flatMap((d) => d.slots).filter((x) => x.subjectId === id).length;
    expect([count("sub-math"), count("sub-physics"), count("sub-arabic"), count("sub-english")]).toEqual([3, 2, 2, 1]);
    for (const d of days) {
      const ids = d.slots.filter((x) => x.kind === "study").map((x) => x.subjectId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeLessThanOrEqual(3);
    }
    expect(days[5].catchUp).toBe(true);
    expect(days[5].slots.some((x) => x.kind === "catchup")).toBe(true);
  });

  it("drops the lowest-priority sessions first when the week is too full", () => {
    const list = [
      subject("Math", { priority: 5, weeklySessions: 6, order: 0 }),
      subject("Physics", { priority: 4, weeklySessions: 6, order: 1 }),
      subject("Arabic", { priority: 3, weeklySessions: 6, order: 2 }),
    ];
    const { days, dropped } = defaultWeeklyPlan(makeSettings({ study: { studyDays: [6, 0, 1], catchUpDay: null, blocksPerDay: 2 } }), list, makeId);
    expect(days.flatMap((d) => d.slots)).toHaveLength(6);
    expect(dropped).toBe(12);
  });
});

describe("nextFreeLesson", () => {
  const l = (id: string, status: "completed" | "not_started") => row("lessons", { id, status });
  it("continues from the first lesson that is neither completed nor already planned", () => {
    const lessons = [l("a", "completed"), l("b", "not_started"), l("c", "not_started")];
    expect(nextFreeLesson(lessons, new Set())?.id).toBe("b");
    expect(nextFreeLesson(lessons, new Set(["b"]))?.id).toBe("c");
    expect(nextFreeLesson(lessons, new Set(["b", "c"]))).toBeNull();
  });
});

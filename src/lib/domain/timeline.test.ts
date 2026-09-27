import { describe, expect, it } from "vitest";
import { computeAnalytics } from "./analytics";
import { buildCurriculumIndex, overallProgress, subjectProgress } from "./curriculum";
import { row, settings as makeSettings, subject } from "./fixtures.test-helpers";
import { blockPriority, buildTimeline, effectiveStatus, revisionPriority, startDelayMinutes, taskPriority } from "./timeline";

const date = "2026-10-03";

describe("timeline", () => {
  it("derives wake, meals, breaks, free time and bedtime from settings", () => {
    const s = makeSettings();
    const blocks = [
      row("scheduleBlocks", { date, start: "10:00", durationMinutes: 90, kind: "study" }),
      row("scheduleBlocks", { date, start: "11:50", durationMinutes: 90, kind: "study" }),
    ];
    const items = buildTimeline(s, date, blocks, []);
    const types = items.map((i) => i.type);
    expect(types[0]).toBe("wake");
    expect(types.at(-1)).toBe("sleep");
    expect(types).toContain("break");
    expect(types).toContain("free");
    expect(items.filter((i) => i.type === "meal")).toHaveLength(s.study.meals.length);
    const brk = items.find((i) => i.type === "break")!;
    expect([brk.start, brk.end]).toEqual([690, 710]);
  });

  it("marks blocks overdue only after their end time", () => {
    const b = row("scheduleBlocks", { date, start: "10:00", durationMinutes: 60, kind: "study" });
    expect(effectiveStatus(b, new Date(2026, 9, 3, 10, 30))).toBe("upcoming");
    expect(effectiveStatus(b, new Date(2026, 9, 3, 11, 1))).toBe("overdue");
    expect(effectiveStatus({ ...b, status: "completed" }, new Date(2026, 9, 4))).toBe("completed");
    expect(startDelayMinutes(b, new Date(2026, 9, 3, 10, 12))).toBe(12);
  });
});

describe("daily priority (Must / Should / Optional)", () => {
  const b = row("scheduleBlocks", { date, start: "10:00", durationMinutes: 90, kind: "study", subjectId: "sub-physics" });
  it("uses transparent rules and manual overrides", () => {
    expect(blockPriority(b, subject("Physics", { priority: 5 }), [], date)).toBe("must");
    expect(blockPriority(b, subject("Physics", { priority: 3 }), [], date)).toBe("should");
    expect(blockPriority(b, subject("English", { priority: 1 }), [], date)).toBe("optional");
    const exam = row("exams", { name: "Test", subjectId: "sub-physics", date: "2026-10-05" });
    expect(blockPriority(b, subject("Physics", { priority: 3 }), [exam], date)).toBe("must");
    expect(blockPriority({ ...b, priority: "optional" }, subject("Physics", { priority: 5 }), [], date)).toBe("optional");
  });
  it("classifies tasks and revisions", () => {
    expect(taskPriority(row("tasks", { title: "x", priority: "high", dueDate: date }), date)).toBe("must");
    expect(taskPriority(row("tasks", { title: "x", priority: "normal", dueDate: date }), date)).toBe("should");
    expect(taskPriority(row("tasks", { title: "x", priority: "low" }), date)).toBe("optional");
    expect(revisionPriority(row("revisions", { scheduledDate: "2026-10-01" }), date)).toBe("must");
    expect(revisionPriority(row("revisions", { scheduledDate: date }), date)).toBe("should");
  });
});

describe("curriculum progress", () => {
  it("averages lesson progress and falls back to the manual estimate", () => {
    const math = subject("Math", { manualProgress: 20 });
    const empty = buildCurriculumIndex([], [], []);
    expect(subjectProgress(math, empty)).toMatchObject({ percent: 20, estimated: true });

    const u = row("units", { subjectId: math.id, name: "U" });
    const c = row("chapters", { subjectId: math.id, unitId: u.id, name: "C" });
    const lessons = [
      row("lessons", { subjectId: math.id, chapterId: c.id, title: "a", status: "completed", order: 0 }),
      row("lessons", { subjectId: math.id, chapterId: c.id, title: "b", status: "not_started", order: 1 }),
    ];
    const p = subjectProgress(math, buildCurriculumIndex([u], [c], lessons));
    expect(p).toMatchObject({ percent: 50, completedLessons: 1, remainingLessons: 1, totalChapters: 1, completedChapters: 0, estimated: false });
    expect(p.nextLesson?.title).toBe("b");
    expect(overallProgress([p, subjectProgress(math, empty)])).toBe(35);
  });
});

describe("analytics aggregation", () => {
  it("computes focus, planned vs completed and question accuracy from real rows", () => {
    const s = makeSettings();
    const sessions = [
      row("studySessions", { startedAt: new Date(2026, 9, 3, 10).toISOString(), status: "completed", focusedMinutes: 75, actualMinutes: 85, questionsAttempted: 20, questionsCorrect: 16, subjectId: "sub-math" }),
      row("studySessions", { startedAt: new Date(2026, 9, 3, 12).toISOString(), status: "active", focusedMinutes: 30, actualMinutes: 30 }),
    ];
    const blocks = [
      row("scheduleBlocks", { date, start: "10:00", durationMinutes: 90, kind: "study", status: "completed" }),
      row("scheduleBlocks", { date, start: "12:00", durationMinutes: 90, kind: "study", status: "skipped" }),
    ];
    const a = computeAnalytics({
      settings: s,
      subjects: [subject("Math")],
      sessions,
      blocks,
      questionSets: [],
      exams: [row("exams", { name: "Q", date, status: "completed", totalMarks: 20, achievedMarks: 15 })],
      revisions: [],
      lessons: [],
      pomodoros: [],
      start: date,
      end: date,
      today: "2026-10-04",
    });
    // Active (unfinished) sessions don't count.
    expect(a.focusedMinutes).toBe(75);
    expect(a.sessionCount).toBe(1);
    expect(a.plannedBlocks).toBe(2);
    expect(a.completedBlocks).toBe(1);
    expect(a.skippedBlocks).toBe(1);
    expect(a.questions.accuracy).toBe(80);
    expect(a.avgExamScore).toBe(75);
    expect(a.perSubject[0]).toMatchObject({ name: "Math", focusedMinutes: 75, accuracy: 80 });
  });
});

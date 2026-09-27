import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateCreate, validateUpdate } from "../schemas/entities";
import { makeBackup, validateBackup } from "../schemas/backup";
import { DEFAULT_SETTINGS, parseSettings } from "../schemas/settings";
import { computeStreak, questionTotals, adaptiveSuggestion } from "./analytics";
import { parseCsv, toCsv } from "./csv";
import { parseCurriculumText, planCurriculumImport } from "./curriculum-import";
import { addDays } from "./dates";
import { row, settings as makeSettings, subject } from "./fixtures.test-helpers";

describe("settings", () => {
  it("fills missing keys from defaults", () => {
    const s = parseSettings({ study: { dailyTargetMinutes: 240 } });
    expect(s.study.dailyTargetMinutes).toBe(240);
    expect(s.study.blockMinutes).toBe(DEFAULT_SETTINGS.study.blockMinutes);
    expect(s.pomodoro.focusMinutes).toBe(25);
  });

  it("repairs only the invalid section", () => {
    const s = parseSettings({ study: { dailyTargetMinutes: 240 }, pomodoro: { focusMinutes: -5 } });
    expect(s.study.dailyTargetMinutes).toBe(240);
    expect(s.pomodoro).toEqual(DEFAULT_SETTINGS.pomodoro);
  });

  it("ignores garbage", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("nope")).toEqual(DEFAULT_SETTINGS);
  });
});

describe("entity validation", () => {
  it("fills defaults on create and rejects bad values", () => {
    const ok = validateCreate("subjects", { name: "Math" });
    expect(ok.success && ok.data.priority).toBe(3);
    expect(validateCreate("subjects", { name: "" }).success).toBe(false);
    expect(validateCreate("scheduleBlocks", { date: "2026-13-01", start: "10:00", durationMinutes: 90, kind: "study" }).success).toBe(false);
    expect(validateCreate("scheduleBlocks", { date: "2026-10-01", start: "25:00", durationMinutes: 90, kind: "study" }).success).toBe(false);
  });

  it("partial updates do not reset other fields to defaults", () => {
    const r = validateUpdate("subjects", { priority: 5 });
    expect(r.success && r.data).toEqual({ priority: 5 });
  });
});

describe("backup import/export", () => {
  it("round-trips a backup", () => {
    const s = subject("Physics");
    const data: Record<string, unknown[]> = Object.fromEntries(
      ["subjects", "units", "chapters", "lessons", "studySessions", "scheduleBlocks", "backlogItems", "tasks", "revisions", "mistakes", "questionSets", "exams", "goals", "calendarEvents", "pomodoroSessions", "thoughts", "sleepEntries", "dailyReviews", "weeklyReviews", "roadmapPhases"].map((k) => [k, []]),
    );
    data.subjects = [s];
    const backup = JSON.parse(JSON.stringify(makeBackup(DEFAULT_SETTINGS, data as never)));
    const v = validateBackup(backup);
    expect(v.ok).toBe(true);
    expect(v.counts.subjects).toBe(1);
    expect(v.backup!.data.subjects[0].name).toBe("Physics");
  });

  it("rejects foreign files and invalid rows with clear errors", () => {
    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    const bad = validateBackup({
      app: "thanaweya-study-os",
      version: 1,
      exportedAt: "x",
      settings: {},
      data: { subjects: [{ id: "a", name: "" }] },
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/subjects\[0\]/);
  });
});

describe("csv", () => {
  it("escapes and parses quotes, commas and newlines", () => {
    const csv = toCsv([{ a: 'He said "hi"', b: "x,y", c: "line1\nline2" }], ["a", "b", "c"]);
    expect(parseCsv(csv)).toEqual([["a", "b", "c"], ['He said "hi"', "x,y", "line1\nline2"]]);
  });
  it("neutralizes spreadsheet formulas", () => {
    expect(toCsv([{ a: "=SUM(A1)" }], ["a"])).toBe("a\r\n'=SUM(A1)");
    expect(toCsv([{ a: -5 }], ["a"])).toBe("a\r\n-5");
  });
});

describe("curriculum import", () => {
  let n = 0;
  const makeId = () => `id-${++n}`;
  const defaults = { lessonMinutes: 60, subjectColor: () => "#123456" };

  it("imports JSON hierarchy and matches existing subjects by name", () => {
    const text = JSON.stringify({
      subject: "physics",
      units: [{ name: "Unit 1", chapters: [{ name: "Ch 1", lessons: ["L1", { title: "L2", estimatedMinutes: 45, topics: ["a", "b"] }] }] }],
    });
    const { data, errors } = parseCurriculumText(text, "c.json");
    expect(errors).toEqual([]);
    const plan = planCurriculumImport(data, { subjects: [subject("Physics")], units: [], chapters: [], lessons: [] }, makeId, defaults);
    expect(plan.subjects).toHaveLength(0);
    expect(plan.units[0].subjectId).toBe("sub-physics");
    expect(plan.lessons.map((l) => l.title)).toEqual(["L1", "L2"]);
    expect(plan.lessons[1].estimatedMinutes).toBe(45);
    expect(plan.lessons[1].topics.map((t) => t.title)).toEqual(["a", "b"]);
  });

  it("imports CSV and skips duplicates", () => {
    const csv = "subject,unit,chapter,lesson,estimated_minutes\nMath,U1,C1,Limits,50\nMath,U1,C1,Limits,50\nMath,U1,C2,Integrals,";
    const { data, errors } = parseCurriculumText(csv, "c.csv");
    expect(errors).toEqual([]);
    const plan = planCurriculumImport(data, { subjects: [], units: [], chapters: [], lessons: [] }, makeId, defaults);
    expect(plan.subjects).toHaveLength(1);
    expect(plan.chapters).toHaveLength(2);
    expect(plan.lessons).toHaveLength(2);
    expect(plan.skippedLessons).toBe(1);
  });

  it("imports the bundled dataset and matches all five subjects to existing subjects", () => {
    const text = readFileSync("public/curriculum/third_secondary_scientific_math_2026_2027_curriculum.json", "utf8");
    const { data, errors } = parseCurriculumText(text, "third.json");
    expect(errors).toEqual([]);
    expect(data.map((d) => d.subject)).toHaveLength(5);
    const existing = ["Arabic", "Math", "Chemistry", "Physics", "English"].map((n) => subject(n));
    const plan = planCurriculumImport(data, { subjects: existing, units: [], chapters: [], lessons: [] }, makeId, defaults);
    expect(plan.subjects).toHaveLength(0);
    expect(plan.lessons).toHaveLength(313);
    expect(new Set(plan.lessons.map((l) => l.subjectId)).size).toBe(5);
    // Re-importing on top of itself adds nothing.
    const again = planCurriculumImport(data, { subjects: existing, units: plan.units.map((u) => ({ ...u, deletedAt: null })) as never, chapters: plan.chapters.map((c) => ({ ...c, deletedAt: null })) as never, lessons: plan.lessons.map((l) => ({ ...l, deletedAt: null })) as never }, makeId, defaults);
    expect(again.lessons).toHaveLength(0);
  });

  it("reports invalid input", () => {
    expect(parseCurriculumText("{bad", "x.json").errors[0]).toMatch(/not valid JSON/);
    expect(parseCurriculumText('{"units": []}', "x.json").errors[0]).toMatch(/subject/);
  });
});

describe("analytics", () => {
  const today = "2026-10-10";
  const session = (date: string, minutes: number, extra: Record<string, unknown> = {}) =>
    row("studySessions", { startedAt: new Date(`${date}T10:00:00`).toISOString(), status: "completed", focusedMinutes: minutes, actualMinutes: minutes, ...extra });

  it("counts a streak of days meeting the minimum, skipping days off", () => {
    const s = makeSettings({ study: { minDailyMinutes: 60 } });
    // Fri 9 Oct is the catch-up day (not a study day) and doesn't break the streak.
    const sessions = ["2026-10-10", "2026-10-08", "2026-10-07"].map((d) => session(d, 90));
    expect(computeStreak(sessions, s, today)).toBe(3);
    expect(computeStreak(sessions, makeSettings({ analytics: { streakSkipsDaysOff: false } }), today)).toBe(1);
  });

  it("does not double-count questions saved both on a session and as a linked set", () => {
    const s1 = session("2026-10-10", 60, { questionsAttempted: 20, questionsCorrect: 15 });
    const s2 = session("2026-10-10", 60, { questionsAttempted: 10, questionsCorrect: 5 });
    const set = row("questionSets", { title: "Set", date: "2026-10-10", attempted: 20, correct: 15, sessionId: s1.id });
    const t = questionTotals([s1, s2], [set]);
    expect(t).toEqual({ attempted: 30, correct: 20, accuracy: (20 / 30) * 100 });
  });

  it("suggests (never applies) a realistic daily target", () => {
    const s = makeSettings({ study: { dailyTargetMinutes: 360 } });
    const sessions = Array.from({ length: 14 }, (_, i) => session(addDays(today, -(i + 1)), 270));
    const suggestion = adaptiveSuggestion(sessions, [], s, today);
    expect(suggestion).toMatchObject({ averageMinutes: 270, targetMinutes: 360, suggestedMinutes: 270 });
    expect(adaptiveSuggestion(sessions, [], makeSettings({ adaptive: { enabled: false } }), today)).toBeNull();
    expect(adaptiveSuggestion(sessions, [], makeSettings({ adaptive: { snoozedUntil: "2026-10-20" } }), today)).toBeNull();
  });
});

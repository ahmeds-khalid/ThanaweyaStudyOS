import type {
  Exam,
  Lesson,
  PomodoroSession,
  QuestionSet,
  Revision,
  ScheduleBlock,
  StudySession,
  Subject,
} from "../schemas/entities";
import type { Settings } from "../schemas/settings";
import { addDays, keysBetween, toDateKey } from "./dates";
import { accuracy, examPercentage } from "./metrics";
import { dayType, FOCUS_KINDS } from "./scheduler";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

export const sessionDate = (s: Pick<StudySession, "startedAt">) => toDateKey(new Date(s.startedAt));

/** Sessions that count as study (finished or abandoned with some focus). */
export function countedSessions(sessions: StudySession[]): StudySession[] {
  return sessions.filter((s) => !s.deletedAt && s.status !== "active");
}

export function focusByDay(sessions: StudySession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of countedSessions(sessions)) {
    const d = sessionDate(s);
    map.set(d, (map.get(d) ?? 0) + s.focusedMinutes);
  }
  return map;
}

/**
 * Consecutive days (ending today, or yesterday if today isn't done yet) with
 * focused study ≥ the configured daily minimum. Optionally days off and the
 * catch-up day don't break the streak.
 */
export function computeStreak(sessions: StudySession[], settings: Settings, today: string): number {
  const focus = focusByDay(sessions);
  const min = Math.max(1, settings.study.minDailyMinutes);
  let streak = 0;
  let day = today;
  if ((focus.get(today) ?? 0) < min) day = addDays(today, -1);
  for (let i = 0; i < 3660; i++) {
    const f = focus.get(day) ?? 0;
    if (f >= min) streak++;
    else if (!(settings.analytics.streakSkipsDaysOff && dayType(settings, day) !== "study")) break;
    day = addDays(day, -1);
  }
  return streak;
}

/** Questions from question sets, plus sessions that don't have a linked set (avoids double counting). */
export function questionTotals(sessions: StudySession[], sets: QuestionSet[], filter?: { start: string; end: string; subjectId?: string }) {
  const liveSets = sets.filter((q) => !q.deletedAt);
  const linked = new Set(liveSets.map((q) => q.sessionId).filter(Boolean));
  const inRange = (d: string) => !filter || (d >= filter.start && d <= filter.end);
  const bySubject = (id: string | null) => !filter?.subjectId || id === filter.subjectId;
  let attempted = 0;
  let correct = 0;
  for (const q of liveSets) {
    if (!inRange(q.date) || !bySubject(q.subjectId)) continue;
    attempted += q.attempted;
    correct += q.correct;
  }
  for (const s of countedSessions(sessions)) {
    if (linked.has(s.id) || !inRange(sessionDate(s)) || !bySubject(s.subjectId)) continue;
    attempted += s.questionsAttempted;
    correct += s.questionsCorrect;
  }
  return { attempted, correct, accuracy: accuracy(correct, attempted) };
}

export interface AnalyticsInput {
  settings: Settings;
  subjects: Subject[];
  sessions: StudySession[];
  blocks: ScheduleBlock[];
  questionSets: QuestionSet[];
  exams: Exam[];
  revisions: Revision[];
  lessons: Lesson[];
  pomodoros: PomodoroSession[];
  start: string;
  end: string;
  today: string;
}

export function computeAnalytics(input: AnalyticsInput) {
  const { start, end } = input;
  const days = keysBetween(start, end);
  const inRange = (d: string) => d >= start && d <= end;
  const sessions = countedSessions(input.sessions).filter((s) => inRange(sessionDate(s)));
  const focus = focusByDay(sessions);

  const focusedMinutes = sum(sessions.map((s) => s.focusedMinutes));
  const totalMinutes = sum(sessions.map((s) => s.actualMinutes));
  const studyDays = [...focus.values()].filter((m) => m > 0).length;

  const blocks = input.blocks.filter((b) => !b.deletedAt && inRange(b.date) && FOCUS_KINDS.has(b.kind));
  const pastBlocks = blocks.filter((b) => b.date < input.today || b.status !== "upcoming");
  const plannedBlocks = pastBlocks.filter((b) => b.status !== "rescheduled");
  const completedBlocks = plannedBlocks.filter((b) => b.status === "completed").length;
  const skippedBlocks = blocks.filter((b) => b.status === "skipped").length;
  const rescheduledBlocks = blocks.filter((b) => b.status === "rescheduled").length;
  const missedBlocks = blocks.filter((b) => b.status === "upcoming" && b.date < input.today).length;

  const questions = questionTotals(input.sessions, input.questionSets, { start, end });

  const exams = input.exams.filter((e) => !e.deletedAt && e.status === "completed" && inRange(e.date));
  const examScores = exams.map((e) => examPercentage(e.achievedMarks, e.totalMarks)).filter((x): x is number => x != null);

  const revisionsDue = input.revisions.filter((r) => !r.deletedAt && inRange(r.scheduledDate) && r.scheduledDate <= input.today);
  const revisionsDone = revisionsDue.filter((r) => r.status === "done").length;

  const lessonsCompleted = input.lessons.filter(
    (l) => !l.deletedAt && l.status === "completed" && l.completedAt && inRange(toDateKey(new Date(l.completedAt))),
  ).length;

  const delays = sessions.map((s) => s.startDelayMinutes).filter((d): d is number => d != null);
  const pomodoros = input.pomodoros.filter((p) => !p.deletedAt && p.phase === "focus" && inRange(toDateKey(new Date(p.startedAt))));
  const completedPomodoros = pomodoros.filter((p) => p.completed);

  const perSubject = input.subjects
    .filter((s) => !s.deletedAt)
    .map((s) => {
      const ss = sessions.filter((x) => x.subjectId === s.id);
      const q = questionTotals(input.sessions, input.questionSets, { start, end, subjectId: s.id });
      return {
        subjectId: s.id,
        name: s.isDemo ? `${s.name} (demo)` : s.name,
        color: s.color,
        focusedMinutes: sum(ss.map((x) => x.focusedMinutes)),
        sessions: ss.length,
        questionsAttempted: q.attempted,
        questionsCorrect: q.correct,
        accuracy: q.accuracy,
      };
    });

  const daily = days.map((d) => {
    const dayBlocks = blocks.filter((b) => b.date === d && b.status !== "rescheduled");
    const q = questionTotals(input.sessions, input.questionSets, { start: d, end: d });
    return {
      date: d,
      focused: focus.get(d) ?? 0,
      total: sum(sessions.filter((s) => sessionDate(s) === d).map((s) => s.actualMinutes)),
      planned: sum(dayBlocks.map((b) => b.durationMinutes)),
      completedPlanned: sum(dayBlocks.filter((b) => b.status === "completed").map((b) => b.durationMinutes)),
      questions: q.attempted,
      accuracy: q.accuracy,
    };
  });

  return {
    days: days.length,
    focusedMinutes,
    totalMinutes,
    sessionCount: sessions.length,
    avgSessionMinutes: avg(sessions.map((s) => s.focusedMinutes)),
    studyDays,
    plannedBlocks: plannedBlocks.length,
    completedBlocks,
    plannedCompletionRate: plannedBlocks.length ? completedBlocks / plannedBlocks.length : null,
    skippedBlocks,
    rescheduledBlocks,
    missedBlocks,
    questions,
    examsCompleted: exams.length,
    avgExamScore: avg(examScores),
    revisionsDue: revisionsDue.length,
    revisionsDone,
    revisionCompletion: revisionsDue.length ? revisionsDone / revisionsDue.length : null,
    lessonsCompleted,
    avgStartDelay: avg(delays),
    interruptions: sum(sessions.map((s) => s.interruptions)),
    phoneChecks: sum(sessions.map((s) => s.phoneChecks)),
    pomodorosCompleted: completedPomodoros.length,
    avgFocusPhaseMinutes: avg(pomodoros.map((p) => p.actualSeconds / 60)),
    starterSessions: sessions.filter((s) => s.starter).length,
    starterContinued: sessions.filter((s) => s.starter && s.starterContinued).length,
    perSubject,
    daily,
  };
}

export type Analytics = ReturnType<typeof computeAnalytics>;

/* ------------------------------------------------------------------ */
/* Adaptive workload                                                    */
/* ------------------------------------------------------------------ */

export interface AdaptiveSuggestion {
  averageMinutes: number;
  targetMinutes: number;
  suggestedMinutes: number;
  daysConsidered: number;
}

/**
 * If recent focused study on study days is consistently below the daily
 * target, suggest a realistic target. Never applied automatically.
 */
export function adaptiveSuggestion(sessions: StudySession[], blocks: ScheduleBlock[], settings: Settings, today: string): AdaptiveSuggestion | null {
  const a = settings.adaptive;
  if (!a.enabled) return null;
  if (a.snoozedUntil && a.snoozedUntil > today) return null;
  const focus = focusByDay(sessions);
  const plannedDays = new Set(blocks.filter((b) => !b.deletedAt && b.kind === "study").map((b) => b.date));
  const days = keysBetween(addDays(today, -a.lookbackDays), addDays(today, -1)).filter(
    (d) => dayType(settings, d) === "study" && (plannedDays.has(d) || (focus.get(d) ?? 0) > 0),
  );
  if (days.length < 5) return null;
  const average = sum(days.map((d) => focus.get(d) ?? 0)) / days.length;
  const target = settings.study.dailyTargetMinutes;
  if (target <= 0 || average >= target * a.threshold) return null;
  const suggested = Math.max(30, Math.round(average / 15) * 15);
  if (suggested >= target) return null;
  return { averageMinutes: Math.round(average), targetMinutes: target, suggestedMinutes: suggested, daysConsidered: days.length };
}

/** Average start delay this week vs. the previous week (minutes; null if not enough data). */
export function startDelayTrend(sessions: StudySession[], today: string) {
  const s = countedSessions(sessions).filter((x) => x.startDelayMinutes != null);
  const window = (from: number, to: number) =>
    s.filter((x) => {
      const d = sessionDate(x);
      return d > addDays(today, -from) && d <= addDays(today, -to);
    });
  const recent = window(7, 0).map((x) => Math.max(0, x.startDelayMinutes!));
  const prior = window(14, 7).map((x) => Math.max(0, x.startDelayMinutes!));
  const r = avg(recent);
  const p = avg(prior);
  if (r == null || p == null || recent.length < 2 || prior.length < 2) return null;
  return { recent: r, prior: p, change: r - p };
}

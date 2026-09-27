import { z } from "zod";
import {
  dateStr,
  hexColor,
  idRef,
  isoDateTime,
  nonNeg,
  nonNegInt,
  rating,
  text,
  timeStr,
} from "./primitives";

/* ------------------------------------------------------------------ */
/* Enumerations (exported as arrays so the UI can render options)      */
/* ------------------------------------------------------------------ */

export const LESSON_STATUSES = ["not_started", "learning", "practicing", "needs_review", "completed"] as const;
export const LESSON_STAGES = [
  "explanation",
  "understanding",
  "examples",
  "practice",
  "test",
  "completed",
  "revision_scheduled",
] as const;
export const ACTIVITY_TYPES = [
  "explanation",
  "practice",
  "revision",
  "exam",
  "mistake_review",
  "reading",
  "memorization",
  "other",
] as const;
export const BLOCK_KINDS = [
  "study",
  "revision",
  "catchup",
  "break",
  "meal",
  "gym",
  "free",
  "personal",
  "wake",
  "sleep",
  "exam",
] as const;
export const BLOCK_STATUSES = ["upcoming", "in_progress", "completed", "skipped", "rescheduled"] as const;
export const BLOCK_SOURCES = ["generated", "manual", "backlog"] as const;
export const DAY_PRIORITIES = ["must", "should", "optional"] as const;
export const TASK_STATUSES = ["inbox", "today", "scheduled", "in_progress", "completed", "archived"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export const RECURRENCES = ["none", "daily", "weekdays", "weekly", "monthly"] as const;
export const REVISION_TYPES = [
  "quick_recall",
  "questions",
  "full_lesson",
  "formula_review",
  "mistake_review",
  "mini_test",
] as const;
export const REVISION_STATUSES = ["pending", "done", "skipped"] as const;
export const MISTAKE_TYPES = [
  "conceptual",
  "calculation",
  "careless",
  "misread",
  "forgot_formula",
  "wrong_method",
  "time_management",
  "other",
] as const;
export const SEVERITIES = ["low", "medium", "high"] as const;
export const EXAM_MODES = ["practice", "timed", "full"] as const;
export const EXAM_STATUSES = ["planned", "in_progress", "completed"] as const;
export const GOAL_TYPES = ["academic", "study_hours", "questions", "lessons", "exams", "habits"] as const;
export const GOAL_TRACKING = ["manual", "focus_hours", "questions", "lessons", "exams", "study_days"] as const;
export const GOAL_STATUSES = ["active", "achieved", "archived"] as const;
export const EVENT_KINDS = [
  "gym",
  "programming",
  "gaming",
  "entertainment",
  "friends",
  "family",
  "personal",
  "free",
  "other",
] as const;
export const POMODORO_PHASES = ["focus", "short_break", "long_break"] as const;
export const THOUGHT_STATUSES = ["parked", "done", "converted", "snoozed"] as const;
export const BACKLOG_STATUSES = ["open", "scheduled", "done", "dropped"] as const;
export const SESSION_STATUSES = ["active", "completed", "abandoned"] as const;

export type LessonStatus = (typeof LESSON_STATUSES)[number];
export type LessonStage = (typeof LESSON_STAGES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type BlockKind = (typeof BLOCK_KINDS)[number];
export type BlockStatus = (typeof BLOCK_STATUSES)[number];
export type DayPriority = (typeof DAY_PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type Recurrence = (typeof RECURRENCES)[number];
export type RevisionType = (typeof REVISION_TYPES)[number];
export type MistakeType = (typeof MISTAKE_TYPES)[number];
export type ExamMode = (typeof EXAM_MODES)[number];
export type GoalType = (typeof GOAL_TYPES)[number];
export type GoalTracking = (typeof GOAL_TRACKING)[number];
export type EventKind = (typeof EVENT_KINDS)[number];
export type PomodoroPhase = (typeof POMODORO_PHASES)[number];

/* ------------------------------------------------------------------ */
/* Nested JSON shapes                                                  */
/* ------------------------------------------------------------------ */

export const checkItem = z.object({ id: idRef, title: text(300), done: z.boolean() });
export type CheckItem = z.infer<typeof checkItem>;

export const reviewEntry = z.object({ date: dateStr, rating });
export type ReviewEntry = z.infer<typeof reviewEntry>;

export const examAnswer = z.object({
  n: z.number().int().min(1),
  answer: text(500),
  /** null = not graded yet */
  correct: z.boolean().nullable(),
  marked: z.boolean(),
  timeSec: nonNegInt,
});
export type ExamAnswer = z.infer<typeof examAnswer>;

export const milestone = z.object({
  id: idRef,
  title: text(300),
  done: z.boolean(),
  date: dateStr.nullable(),
});
export type Milestone = z.infer<typeof milestone>;

/* ------------------------------------------------------------------ */
/* Entity field shapes (no defaults here — see ENTITY_DEFAULTS)        */
/* ------------------------------------------------------------------ */

const common = { isDemo: z.boolean() };

export const subjectShape = z.object({
  ...common,
  name: text(80).min(1),
  icon: text(40),
  color: hexColor,
  priority: rating,
  weeklyTargetHours: nonNeg.max(80),
  weeklySessions: nonNegInt.max(28),
  difficulty: rating,
  importance: rating,
  enabled: z.boolean(),
  archived: z.boolean(),
  order: z.number().int(),
  examDate: dateStr.nullable(),
  notes: text(),
  /** Used as progress when no lessons are entered yet (onboarding "current progress"). */
  manualProgress: z.number().min(0).max(100).nullable(),
  currentChapterId: idRef.nullable(),
});

export const unitShape = z.object({
  ...common,
  subjectId: idRef,
  name: text(200).min(1),
  order: z.number().int(),
  notes: text(),
});

export const chapterShape = z.object({
  ...common,
  subjectId: idRef,
  unitId: idRef,
  name: text(200).min(1),
  order: z.number().int(),
  notes: text(),
});

export const lessonShape = z.object({
  ...common,
  subjectId: idRef,
  chapterId: idRef,
  title: text(200).min(1),
  description: text(),
  estimatedMinutes: nonNegInt.max(1440),
  status: z.enum(LESSON_STATUSES),
  stage: z.enum(LESSON_STAGES),
  difficulty: rating,
  teacher: text(120),
  videoUrl: text(1000),
  notes: text(20000),
  topics: z.array(checkItem).max(200),
  completion: z.number().min(0).max(100),
  startedAt: isoDateTime.nullable(),
  completedAt: isoDateTime.nullable(),
  explanationMinutes: nonNegInt,
  practiceMinutes: nonNegInt,
  questionsAttempted: nonNegInt,
  questionsCorrect: nonNegInt,
  testScore: nonNeg.nullable(),
  testTotal: nonNeg.nullable(),
  order: z.number().int(),
});

export const studySessionShape = z.object({
  ...common,
  subjectId: idRef.nullable(),
  lessonId: idRef.nullable(),
  blockId: idRef.nullable(),
  activity: z.enum(ACTIVITY_TYPES),
  title: text(200),
  status: z.enum(SESSION_STATUSES),
  startedAt: isoDateTime,
  endedAt: isoDateTime.nullable(),
  plannedMinutes: nonNegInt.max(1440),
  actualMinutes: nonNegInt.max(1440),
  focusedMinutes: nonNegInt.max(1440),
  interruptions: nonNegInt,
  phoneChecks: nonNegInt,
  pomodoros: nonNegInt,
  questionsAttempted: nonNegInt,
  questionsCorrect: nonNegInt,
  focusRating: rating.nullable(),
  difficultyRating: rating.nullable(),
  confidence: rating.nullable(),
  notes: text(),
  /** Session began as a 5-minute "Start Small" starter. */
  starter: z.boolean(),
  /** For starters: whether the user chose to continue after 5 minutes. */
  starterContinued: z.boolean().nullable(),
  /** Minutes between planned block start and actual start (only when started from a block). */
  startDelayMinutes: z.number().int().nullable(),
});

export const scheduleBlockShape = z.object({
  ...common,
  date: dateStr,
  start: timeStr,
  durationMinutes: nonNegInt.min(5).max(1440),
  kind: z.enum(BLOCK_KINDS),
  title: text(200),
  subjectId: idRef.nullable(),
  lessonId: idRef.nullable(),
  activity: z.enum(ACTIVITY_TYPES).nullable(),
  /** Manual override; null = computed automatically. */
  priority: z.enum(DAY_PRIORITIES).nullable(),
  status: z.enum(BLOCK_STATUSES),
  source: z.enum(BLOCK_SOURCES),
  sessionId: idRef.nullable(),
  backlogId: idRef.nullable(),
  /** Locked blocks are never replaced by the planner. */
  locked: z.boolean(),
  notes: text(),
});

export const backlogItemShape = z.object({
  ...common,
  subjectId: idRef.nullable(),
  lessonId: idRef.nullable(),
  title: text(200).min(1),
  activity: z.enum(ACTIVITY_TYPES).nullable(),
  estimatedMinutes: nonNegInt.min(5).max(600),
  importance: rating,
  deadline: dateStr.nullable(),
  sourceBlockId: idRef.nullable(),
  status: z.enum(BACKLOG_STATUSES),
  scheduledBlockId: idRef.nullable(),
  notes: text(),
});

export const taskShape = z.object({
  ...common,
  title: text(300).min(1),
  description: text(),
  subjectId: idRef.nullable(),
  lessonId: idRef.nullable(),
  priority: z.enum(TASK_PRIORITIES),
  estimatedMinutes: nonNegInt.max(1440).nullable(),
  dueDate: dateStr.nullable(),
  recurrence: z.enum(RECURRENCES),
  status: z.enum(TASK_STATUSES),
  tags: z.array(text(40)).max(30),
  subtasks: z.array(checkItem).max(100),
  notes: text(),
  completedAt: isoDateTime.nullable(),
  order: z.number().int(),
});

export const revisionShape = z.object({
  ...common,
  subjectId: idRef.nullable(),
  lessonId: idRef.nullable(),
  mistakeId: idRef.nullable(),
  title: text(200),
  type: z.enum(REVISION_TYPES),
  scheduledDate: dateStr,
  durationMinutes: nonNegInt.min(5).max(600),
  status: z.enum(REVISION_STATUSES),
  rating: rating.nullable(),
  /** Index into the configured interval ladder. */
  step: nonNegInt.max(50),
  completedAt: isoDateTime.nullable(),
  notes: text(),
});

export const mistakeShape = z.object({
  ...common,
  subjectId: idRef.nullable(),
  lessonId: idRef.nullable(),
  question: text(10000).min(1),
  source: text(200),
  type: z.enum(MISTAKE_TYPES),
  explanation: text(10000),
  correctMethod: text(10000),
  severity: z.enum(SEVERITIES),
  tags: z.array(text(40)).max(30),
  /** Compressed data URL; ~1.5MB cap keeps the database and backups reasonable. */
  image: z.string().max(2_000_000).nullable(),
  occurredOn: dateStr,
  nextReviewDate: dateStr.nullable(),
  step: nonNegInt.max(50),
  reviewHistory: z.array(reviewEntry).max(500),
  resolved: z.boolean(),
});

export const questionSetShape = z.object({
  ...common,
  title: text(200).min(1),
  subjectId: idRef.nullable(),
  lessonId: idRef.nullable(),
  sessionId: idRef.nullable(),
  source: text(200),
  total: nonNegInt.max(10000),
  attempted: nonNegInt.max(10000),
  correct: nonNegInt.max(10000),
  wrong: nonNegInt.max(10000),
  skipped: nonNegInt.max(10000),
  totalMinutes: nonNeg.max(10000).nullable(),
  date: dateStr,
  notes: text(),
});

export const examShape = z.object({
  ...common,
  name: text(200).min(1),
  subjectId: idRef.nullable(),
  date: dateStr,
  durationMinutes: nonNegInt.max(600),
  totalMarks: nonNeg.max(10000),
  achievedMarks: nonNeg.max(10000).nullable(),
  questionCount: nonNegInt.max(500),
  source: text(200),
  notes: text(),
  mode: z.enum(EXAM_MODES),
  status: z.enum(EXAM_STATUSES),
  allowPause: z.boolean(),
  answers: z.array(examAnswer).max(500),
  startedAt: isoDateTime.nullable(),
  submittedAt: isoDateTime.nullable(),
  timeUsedSec: nonNegInt.nullable(),
});

export const goalShape = z.object({
  ...common,
  name: text(200).min(1),
  type: z.enum(GOAL_TYPES),
  target: nonNeg.max(1_000_000),
  current: nonNeg.max(1_000_000),
  unit: text(40),
  deadline: dateStr.nullable(),
  subjectId: idRef.nullable(),
  notes: text(),
  milestones: z.array(milestone).max(100),
  tracking: z.enum(GOAL_TRACKING),
  trackFrom: dateStr.nullable(),
  status: z.enum(GOAL_STATUSES),
});

export const calendarEventShape = z.object({
  ...common,
  title: text(200).min(1),
  kind: z.enum(EVENT_KINDS),
  date: dateStr,
  start: timeStr,
  durationMinutes: nonNegInt.min(5).max(1440),
  recurrence: z.enum(["none", "weekly"]),
  /** 0 = Sunday … 6 = Saturday, used when recurrence = weekly. */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  until: dateStr.nullable(),
  /** Fixed events block the planner from scheduling study at the same time. */
  isFixed: z.boolean(),
  notes: text(),
});

export const pomodoroSessionShape = z.object({
  ...common,
  sessionId: idRef.nullable(),
  subjectId: idRef.nullable(),
  phase: z.enum(POMODORO_PHASES),
  startedAt: isoDateTime,
  endedAt: isoDateTime,
  plannedSeconds: nonNegInt,
  actualSeconds: nonNegInt,
  completed: z.boolean(),
});

export const thoughtShape = z.object({
  ...common,
  text: text(2000).min(1),
  status: z.enum(THOUGHT_STATUSES),
  snoozedUntil: dateStr.nullable(),
  sessionId: idRef.nullable(),
  taskId: idRef.nullable(),
});

export const sleepEntryShape = z.object({
  ...common,
  /** The morning the user woke up. */
  date: dateStr,
  bedtime: isoDateTime,
  wakeTime: isoDateTime,
  durationMinutes: nonNegInt.max(24 * 60),
  quality: rating.nullable(),
  notes: text(),
});

export const dailyReviewShape = z.object({
  ...common,
  date: dateStr,
  wentWell: text(),
  change: text(),
  unfinished: text(),
  summary: z.record(z.string(), z.number()),
});

export const weeklyReviewShape = z.object({
  ...common,
  weekStart: dateStr,
  wentWell: text(),
  obstacle: text(),
  change: text(),
  focusSubjectId: idRef.nullable(),
  summary: z.record(z.string(), z.number()),
});

export const roadmapPhaseShape = z.object({
  ...common,
  name: text(120).min(1),
  description: text(),
  startDate: dateStr,
  endDate: dateStr,
  color: hexColor,
  order: z.number().int(),
  targetCompletion: z.number().min(0).max(100).nullable(),
});

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

export const ENTITY_SHAPES = {
  subjects: subjectShape,
  units: unitShape,
  chapters: chapterShape,
  lessons: lessonShape,
  studySessions: studySessionShape,
  scheduleBlocks: scheduleBlockShape,
  backlogItems: backlogItemShape,
  tasks: taskShape,
  revisions: revisionShape,
  mistakes: mistakeShape,
  questionSets: questionSetShape,
  exams: examShape,
  goals: goalShape,
  calendarEvents: calendarEventShape,
  pomodoroSessions: pomodoroSessionShape,
  thoughts: thoughtShape,
  sleepEntries: sleepEntryShape,
  dailyReviews: dailyReviewShape,
  weeklyReviews: weeklyReviewShape,
  roadmapPhases: roadmapPhaseShape,
} as const;

export type EntityName = keyof typeof ENTITY_SHAPES;
export const ENTITY_NAMES = Object.keys(ENTITY_SHAPES) as EntityName[];

export type EntityFields<E extends EntityName> = z.infer<(typeof ENTITY_SHAPES)[E]>;

export interface BaseRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type Row<E extends EntityName> = EntityFields<E> & BaseRow;

export type Subject = Row<"subjects">;
export type Unit = Row<"units">;
export type Chapter = Row<"chapters">;
export type Lesson = Row<"lessons">;
export type StudySession = Row<"studySessions">;
export type ScheduleBlock = Row<"scheduleBlocks">;
export type BacklogItem = Row<"backlogItems">;
export type Task = Row<"tasks">;
export type Revision = Row<"revisions">;
export type Mistake = Row<"mistakes">;
export type QuestionSet = Row<"questionSets">;
export type Exam = Row<"exams">;
export type Goal = Row<"goals">;
export type CalendarEvent = Row<"calendarEvents">;
export type PomodoroSession = Row<"pomodoroSessions">;
export type Thought = Row<"thoughts">;
export type SleepEntry = Row<"sleepEntries">;
export type DailyReview = Row<"dailyReviews">;
export type WeeklyReview = Row<"weeklyReviews">;
export type RoadmapPhase = Row<"roadmapPhases">;

/**
 * Default field values used when creating a row. Required fields that have
 * no sensible default (titles, foreign keys, dates) are omitted and must be
 * supplied by the caller — validation will reject the row otherwise.
 */
export const ENTITY_DEFAULTS: { [E in EntityName]: Partial<EntityFields<E>> } = {
  subjects: {
    isDemo: false,
    icon: "book-open",
    color: "#6366f1",
    priority: 3,
    weeklyTargetHours: 5,
    weeklySessions: 3,
    difficulty: 3,
    importance: 3,
    enabled: true,
    archived: false,
    order: 0,
    examDate: null,
    notes: "",
    manualProgress: null,
    currentChapterId: null,
  },
  units: { isDemo: false, order: 0, notes: "" },
  chapters: { isDemo: false, order: 0, notes: "" },
  lessons: {
    isDemo: false,
    description: "",
    estimatedMinutes: 60,
    status: "not_started",
    stage: "explanation",
    difficulty: 3,
    teacher: "",
    videoUrl: "",
    notes: "",
    topics: [],
    completion: 0,
    startedAt: null,
    completedAt: null,
    explanationMinutes: 0,
    practiceMinutes: 0,
    questionsAttempted: 0,
    questionsCorrect: 0,
    testScore: null,
    testTotal: null,
    order: 0,
  },
  studySessions: {
    isDemo: false,
    subjectId: null,
    lessonId: null,
    blockId: null,
    activity: "practice",
    title: "",
    status: "active",
    endedAt: null,
    plannedMinutes: 0,
    actualMinutes: 0,
    focusedMinutes: 0,
    interruptions: 0,
    phoneChecks: 0,
    pomodoros: 0,
    questionsAttempted: 0,
    questionsCorrect: 0,
    focusRating: null,
    difficultyRating: null,
    confidence: null,
    notes: "",
    starter: false,
    starterContinued: null,
    startDelayMinutes: null,
  },
  scheduleBlocks: {
    isDemo: false,
    title: "",
    subjectId: null,
    lessonId: null,
    activity: null,
    priority: null,
    status: "upcoming",
    source: "manual",
    sessionId: null,
    backlogId: null,
    locked: false,
    notes: "",
  },
  backlogItems: {
    isDemo: false,
    subjectId: null,
    lessonId: null,
    activity: null,
    estimatedMinutes: 60,
    importance: 3,
    deadline: null,
    sourceBlockId: null,
    status: "open",
    scheduledBlockId: null,
    notes: "",
  },
  tasks: {
    isDemo: false,
    description: "",
    subjectId: null,
    lessonId: null,
    priority: "normal",
    estimatedMinutes: null,
    dueDate: null,
    recurrence: "none",
    status: "inbox",
    tags: [],
    subtasks: [],
    notes: "",
    completedAt: null,
    order: 0,
  },
  revisions: {
    isDemo: false,
    subjectId: null,
    lessonId: null,
    mistakeId: null,
    title: "",
    type: "quick_recall",
    durationMinutes: 20,
    status: "pending",
    rating: null,
    step: 0,
    completedAt: null,
    notes: "",
  },
  mistakes: {
    isDemo: false,
    subjectId: null,
    lessonId: null,
    source: "",
    type: "other",
    explanation: "",
    correctMethod: "",
    severity: "medium",
    tags: [],
    image: null,
    nextReviewDate: null,
    step: 0,
    reviewHistory: [],
    resolved: false,
  },
  questionSets: {
    isDemo: false,
    subjectId: null,
    lessonId: null,
    sessionId: null,
    source: "",
    total: 0,
    attempted: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    totalMinutes: null,
    notes: "",
  },
  exams: {
    isDemo: false,
    subjectId: null,
    durationMinutes: 60,
    totalMarks: 100,
    achievedMarks: null,
    questionCount: 0,
    source: "",
    notes: "",
    mode: "practice",
    status: "planned",
    allowPause: true,
    answers: [],
    startedAt: null,
    submittedAt: null,
    timeUsedSec: null,
  },
  goals: {
    isDemo: false,
    type: "academic",
    target: 100,
    current: 0,
    unit: "",
    deadline: null,
    subjectId: null,
    notes: "",
    milestones: [],
    tracking: "manual",
    trackFrom: null,
    status: "active",
  },
  calendarEvents: {
    isDemo: false,
    kind: "personal",
    durationMinutes: 60,
    recurrence: "none",
    weekdays: [],
    until: null,
    isFixed: true,
    notes: "",
  },
  pomodoroSessions: { isDemo: false, sessionId: null, subjectId: null, completed: true },
  thoughts: { isDemo: false, status: "parked", snoozedUntil: null, sessionId: null, taskId: null },
  sleepEntries: { isDemo: false, quality: null, notes: "" },
  dailyReviews: { isDemo: false, wentWell: "", change: "", unfinished: "", summary: {} },
  weeklyReviews: {
    isDemo: false,
    wentWell: "",
    obstacle: "",
    change: "",
    focusSubjectId: null,
    summary: {},
  },
  roadmapPhases: { isDemo: false, description: "", color: "#6366f1", order: 0, targetCompletion: null },
};

/** Fields stored as JSON columns in the database. */
export const JSON_FIELDS: Partial<Record<EntityName, string[]>> = {
  lessons: ["topics"],
  tasks: ["tags", "subtasks"],
  mistakes: ["tags", "reviewHistory"],
  exams: ["answers"],
  goals: ["milestones"],
  calendarEvents: ["weekdays"],
  dailyReviews: ["summary"],
  weeklyReviews: ["summary"],
};

export function validateCreate<E extends EntityName>(entity: E, input: unknown): z.ZodSafeParseResult<EntityFields<E>> {
  const base = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const schema = ENTITY_SHAPES[entity] as unknown as z.ZodType<EntityFields<E>>;
  return schema.safeParse({ ...ENTITY_DEFAULTS[entity], ...base });
}

export function validateUpdate<E extends EntityName>(entity: E, patch: unknown): z.ZodSafeParseResult<Partial<EntityFields<E>>> {
  const schema = (ENTITY_SHAPES[entity] as unknown as z.ZodObject).partial() as unknown as z.ZodType<Partial<EntityFields<E>>>;
  return schema.safeParse(patch ?? {});
}

import { z } from "zod";
import { dateStr, timeStr } from "./primitives";

const weekday = z.number().int().min(0).max(6);
const minutes = (max = 24 * 60) => z.number().int().min(0).max(max);

export const RATING_EFFECTS = ["reset", "back", "repeat", "next", "skip"] as const;
export type RatingEffect = (typeof RATING_EFFECTS)[number];

export const NOTIFICATION_MODES = ["off", "once", "custom"] as const;

const notificationCategory = z.object({
  mode: z.enum(NOTIFICATION_MODES),
  /** Minutes before the event (for event-relative reminders). */
  leadMinutes: minutes(24 * 60),
  /** Clock time for daily reminders. */
  time: timeStr,
});

export const SLOT_KINDS = ["study", "revision", "catchup"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

/** One recurring block of a weekday, e.g. "Mathematics, 90 min, preferably at 16:00". */
export const planSlotSchema = z.object({
  id: z.string().min(1).max(24),
  kind: z.enum(SLOT_KINDS),
  /** Subject for study blocks; null for weekly revision / catch-up. */
  subjectId: z.string().min(1).max(64).nullable(),
  /** Preferred start; null = placed automatically inside the study window. */
  start: timeStr.nullable(),
  durationMinutes: minutes(480).min(5),
});
export type PlanSlot = z.infer<typeof planSlotSchema>;

export const planDaySchema = z.object({
  /** Whole weekday off: nothing is generated. */
  off: z.boolean(),
  /** The day set aside for catching up on missed blocks. */
  catchUp: z.boolean(),
  slots: z.array(planSlotSchema).max(12),
});
export type PlanDay = z.infer<typeof planDaySchema>;

export const settingsSchema = z.object({
  version: z.literal(1),
  onboardingCompleted: z.boolean(),
  profile: z.object({
    name: z.string().max(80),
    academicYear: z.string().max(20),
    grade: z.string().max(80),
    track: z.string().max(80),
    targetPercentage: z.number().min(0).max(100),
    goalText: z.string().max(500),
  }),
  general: z.object({
    language: z.enum(["en", "ar"]),
    theme: z.enum(["system", "light", "dark"]),
    /** 0 = Sunday … 6 = Saturday */
    weekStartsOn: weekday,
    timeFormat: z.enum(["24h", "12h"]),
    dateFormat: z.enum(["d MMM yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]),
  }),
  sleep: z.object({
    bedtime: timeStr,
    wakeTime: timeStr,
    targetHours: z.number().min(3).max(14),
  }),
  study: z.object({
    blockMinutes: minutes(300).min(15),
    breakMinutes: minutes(120),
    dailyTargetMinutes: minutes(16 * 60),
    minDailyMinutes: minutes(16 * 60),
    maxDailyMinutes: minutes(16 * 60),
    blocksPerDay: z.number().int().min(1).max(12),
    /** Regular study weekdays. */
    studyDays: z.array(weekday).max(7),
    /** Weekday reserved for catch-up (null = none). Not a regular study day. */
    catchUpDay: weekday.nullable(),
    /** Specific dates off (holidays etc.). */
    daysOff: z.array(dateStr).max(366),
    windowStart: timeStr,
    windowEnd: timeStr,
    meals: z
      .array(z.object({ id: z.string(), name: z.string().max(40), time: timeStr, durationMinutes: minutes(240).min(5) }))
      .max(8),
    /** Put higher-difficulty/priority subjects earlier in the day. */
    hardFirst: z.boolean(),
  }),
  /**
   * The recurring weekly routine. The calendar, Today and the Weekly Plan screen
   * are all generated from this: index 0 = Sunday … 6 = Saturday.
   */
  weeklyPlan: z.object({
    /** False until the routine exists (it is then generated from the subjects' weekly targets). */
    configured: z.boolean(),
    days: z.array(planDaySchema).length(7),
    /** The routine stops repeating after this date (e.g. the end of the academic year). */
    endsOn: dateStr.nullable(),
  }),
  pomodoro: z.object({
    preset: z.enum(["classic", "deep", "long", "custom"]),
    focusMinutes: minutes(240).min(1),
    shortBreakMinutes: minutes(120).min(1),
    longBreakMinutes: minutes(120).min(1),
    cyclesBeforeLongBreak: z.number().int().min(1).max(12),
    autoStartFocus: z.boolean(),
    autoStartBreaks: z.boolean(),
    sound: z.boolean(),
    soundType: z.enum(["chime", "bell", "beep"]),
    volume: z.number().min(0).max(1),
    notification: z.boolean(),
    fullscreen: z.boolean(),
    showRemaining: z.boolean(),
    timerStyle: z.enum(["ring", "digital", "minimal"]),
  }),
  focus: z.object({
    phoneAwayPrompt: z.boolean(),
    focusModeByDefault: z.boolean(),
    hideTimer: z.boolean(),
    showOnlyTask: z.boolean(),
  }),
  shortcuts: z.object({
    commandPalette: z.string().max(30),
    pauseResume: z.string().max(30),
    exitFocus: z.string().max(30),
    nextTask: z.string().max(30),
    restartTimer: z.string().max(30),
    captureThought: z.string().max(30),
    toggleFocus: z.string().max(30),
  }),
  scheduler: z.object({
    maxSameSubjectPerDay: z.number().int().min(1).max(6),
    maxConsecutiveHard: z.number().int().min(1).max(6),
    hardDifficultyThreshold: z.number().int().min(1).max(5),
    examBoostDays: z.number().int().min(0).max(60),
    examBoostFactor: z.number().min(1).max(3),
    maxBacklogMinutesPerDay: minutes(600),
    catchUpDayMaxMinutes: minutes(900),
    /** Minimum free minutes to keep between study end and bedtime. */
    minFreeMinutesPerDay: minutes(600),
    revisionBlocks: z.boolean(),
    revisionBlockMinutes: minutes(180).min(10),
    rampUp: z.object({
      enabled: z.boolean(),
      startBlocks: z.number().int().min(1).max(12),
      completionThreshold: z.number().min(0.1).max(1),
    }),
    /** Days to look ahead when finding a slot for rescheduled work. */
    rescheduleHorizonDays: z.number().int().min(1).max(30),
  }),
  revision: z.object({
    intervals: z.array(z.number().int().min(1).max(365)).min(1).max(12),
    ratingEffects: z.object({
      "1": z.enum(RATING_EFFECTS),
      "2": z.enum(RATING_EFFECTS),
      "3": z.enum(RATING_EFFECTS),
      "4": z.enum(RATING_EFFECTS),
      "5": z.enum(RATING_EFFECTS),
    }),
    /** Multiplier applied to the last interval once the ladder is exhausted. */
    growthAfterLast: z.number().min(1).max(4),
    defaultType: z.enum(["quick_recall", "questions", "full_lesson", "formula_review", "mistake_review", "mini_test"]),
    defaultDurationMinutes: minutes(300).min(5),
    askOnLessonComplete: z.boolean(),
  }),
  notifications: z.object({
    browser: z.boolean(),
    sound: z.boolean(),
    categories: z.object({
      studyReminder: notificationCategory,
      revisionDue: notificationCategory,
      examReminder: notificationCategory,
      taskDue: notificationCategory,
      sleepReminder: notificationCategory,
      dailyStudyReminder: notificationCategory,
    }),
  }),
  display: z.object({
    density: z.enum(["comfortable", "compact"]),
    animations: z.boolean(),
    reducedMotion: z.boolean(),
    sidebarCollapsed: z.boolean(),
  }),
  workload: z.object({
    /** Minute thresholds: < [0] Light, < [1] Normal, < [2] Heavy, otherwise Overloaded. */
    lightBelow: minutes(),
    normalBelow: minutes(),
    heavyBelow: minutes(),
  }),
  analytics: z.object({
    showConsistencyScore: z.boolean(),
    /** Days off / catch-up day don't break the streak. */
    streakSkipsDaysOff: z.boolean(),
  }),
  adaptive: z.object({
    enabled: z.boolean(),
    lookbackDays: z.number().int().min(7).max(60),
    /** Suggest when completed/target is below this ratio. */
    threshold: z.number().min(0.3).max(1),
    snoozedUntil: dateStr.nullable(),
  }),
  freeTime: z.object({
    activities: z.array(z.string().max(40)).max(20),
    showFreeMessage: z.boolean(),
  }),
  roadmap: z.object({
    /** User-entered; never assumed. */
    finalExamDate: dateStr.nullable(),
    notes: z.string().max(2000),
  }),
  demo: z.object({ loaded: z.boolean() }),
});

export type Settings = z.infer<typeof settingsSchema>;
export type NotificationCategoryKey = keyof Settings["notifications"]["categories"];

export const POMODORO_PRESETS = {
  classic: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 3 },
  deep: { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, cyclesBeforeLongBreak: 3 },
  long: { focusMinutes: 90, shortBreakMinutes: 15, longBreakMinutes: 30, cyclesBeforeLongBreak: 2 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  onboardingCompleted: false,
  profile: {
    name: "",
    academicYear: "",
    grade: "",
    track: "",
    targetPercentage: 85,
    goalText: "",
  },
  general: {
    language: "en",
    theme: "dark",
    weekStartsOn: 6,
    timeFormat: "24h",
    dateFormat: "d MMM yyyy",
  },
  sleep: { bedtime: "00:00", wakeTime: "09:00", targetHours: 9 },
  study: {
    blockMinutes: 90,
    breakMinutes: 20,
    dailyTargetMinutes: 360,
    minDailyMinutes: 60,
    maxDailyMinutes: 420,
    blocksPerDay: 4,
    studyDays: [6, 0, 1, 2, 3, 4],
    catchUpDay: 5,
    daysOff: [],
    windowStart: "10:00",
    windowEnd: "21:30",
    meals: [
      { id: "breakfast", name: "Breakfast", time: "09:15", durationMinutes: 30 },
      { id: "lunch", name: "Lunch", time: "14:30", durationMinutes: 60 },
      { id: "dinner", name: "Dinner", time: "20:00", durationMinutes: 45 },
    ],
    hardFirst: true,
  },
  weeklyPlan: {
    configured: false,
    days: Array.from({ length: 7 }, () => ({ off: false, catchUp: false, slots: [] })),
    endsOn: null,
  },
  pomodoro: {
    preset: "classic",
    ...POMODORO_PRESETS.classic,
    autoStartFocus: false,
    autoStartBreaks: true,
    sound: true,
    soundType: "chime",
    volume: 0.6,
    notification: true,
    fullscreen: false,
    showRemaining: true,
    timerStyle: "ring",
  },
  focus: {
    phoneAwayPrompt: true,
    focusModeByDefault: true,
    hideTimer: false,
    showOnlyTask: false,
  },
  shortcuts: {
    commandPalette: "mod+k",
    pauseResume: "space",
    exitFocus: "escape",
    nextTask: "n",
    restartTimer: "r",
    captureThought: "t",
    toggleFocus: "f",
  },
  scheduler: {
    maxSameSubjectPerDay: 2,
    maxConsecutiveHard: 2,
    hardDifficultyThreshold: 4,
    examBoostDays: 7,
    examBoostFactor: 1.5,
    maxBacklogMinutesPerDay: 90,
    catchUpDayMaxMinutes: 240,
    minFreeMinutesPerDay: 120,
    revisionBlocks: true,
    revisionBlockMinutes: 45,
    rampUp: { enabled: true, startBlocks: 3, completionThreshold: 0.8 },
    rescheduleHorizonDays: 10,
  },
  revision: {
    intervals: [1, 3, 7, 14, 30],
    ratingEffects: { "1": "reset", "2": "repeat", "3": "next", "4": "next", "5": "skip" },
    growthAfterLast: 2,
    defaultType: "quick_recall",
    defaultDurationMinutes: 20,
    askOnLessonComplete: true,
  },
  notifications: {
    browser: false,
    sound: true,
    categories: {
      studyReminder: { mode: "custom", leadMinutes: 5, time: "10:00" },
      revisionDue: { mode: "once", leadMinutes: 0, time: "11:00" },
      examReminder: { mode: "once", leadMinutes: 24 * 60, time: "19:00" },
      taskDue: { mode: "once", leadMinutes: 0, time: "10:30" },
      sleepReminder: { mode: "custom", leadMinutes: 30, time: "23:30" },
      dailyStudyReminder: { mode: "off", leadMinutes: 0, time: "11:00" },
    },
  },
  display: { density: "comfortable", animations: true, reducedMotion: false, sidebarCollapsed: false },
  workload: { lightBelow: 180, normalBelow: 300, heavyBelow: 420 },
  analytics: { showConsistencyScore: false, streakSkipsDaysOff: true },
  adaptive: { enabled: true, lookbackDays: 14, threshold: 0.85, snoozedUntil: null },
  freeTime: { activities: ["Gym", "Programming", "Gaming"], showFreeMessage: true },
  roadmap: { finalExamDate: null, notes: "" },
  demo: { loaded: false },
};

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === "object" && !Array.isArray(v);

/** Recursively overlay `patch` onto `base`. Arrays and primitives replace. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = k in base ? deepMerge((base as Plain)[k], v) : v;
  }
  return out as T;
}

/**
 * Parse stored settings, filling missing keys from defaults. Invalid sections
 * fall back to their defaults individually, so one bad value never wipes the
 * user's other preferences.
 */
export function parseSettings(raw: unknown): Settings {
  const merged = deepMerge(DEFAULT_SETTINGS, isPlain(raw) ? raw : {});
  const full = settingsSchema.safeParse(merged);
  if (full.success) return full.data;

  const repaired: Plain = { ...(merged as Plain) };
  const shape = settingsSchema.shape as Record<string, z.ZodType>;
  for (const key of Object.keys(shape)) {
    const section = shape[key].safeParse(repaired[key]);
    if (!section.success) repaired[key] = (DEFAULT_SETTINGS as Plain)[key];
  }
  const second = settingsSchema.safeParse(repaired);
  return second.success ? second.data : DEFAULT_SETTINGS;
}

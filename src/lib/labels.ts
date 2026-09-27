import type {
  ActivityType,
  EventKind,
  ExamMode,
  GoalTracking,
  GoalType,
  LessonStage,
  LessonStatus,
  MistakeType,
  Recurrence,
  RevisionType,
  TaskPriority,
  TaskStatus,
} from "./schemas/entities";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  explanation: "Explanation",
  practice: "Practice",
  revision: "Revision",
  exam: "Exam",
  mistake_review: "Mistake review",
  reading: "Reading",
  memorization: "Memorization",
  other: "Other",
};

export const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  not_started: "Not started",
  learning: "Learning",
  practicing: "Practicing",
  needs_review: "Needs review",
  completed: "Completed",
};

export const LESSON_STATUS_TONE: Record<LessonStatus, "neutral" | "info" | "accent" | "warning" | "success"> = {
  not_started: "neutral",
  learning: "info",
  practicing: "accent",
  needs_review: "warning",
  completed: "success",
};

export const LESSON_STAGE_LABELS: Record<LessonStage, string> = {
  explanation: "1. Explanation",
  understanding: "2. Understanding check",
  examples: "3. Worked examples",
  practice: "4. Independent practice",
  test: "5. Test",
  completed: "6. Completed",
  revision_scheduled: "7. Revision scheduled",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  today: "Today",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

export const TASK_PRIORITY_TONE: Record<TaskPriority, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  critical: "danger",
};

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every study day",
  weekly: "Every week",
  monthly: "Every month",
};

export const REVISION_TYPE_LABELS: Record<RevisionType, string> = {
  quick_recall: "Quick recall",
  questions: "Questions",
  full_lesson: "Full lesson",
  formula_review: "Formula review",
  mistake_review: "Mistake review",
  mini_test: "Mini test",
};

export const MISTAKE_TYPE_LABELS: Record<MistakeType, string> = {
  conceptual: "Conceptual",
  calculation: "Calculation",
  careless: "Careless",
  misread: "Misread question",
  forgot_formula: "Forgot formula",
  wrong_method: "Wrong method",
  time_management: "Time management",
  other: "Other",
};

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  gym: "Gym",
  programming: "Programming",
  gaming: "Gaming",
  entertainment: "Entertainment",
  friends: "Friends",
  family: "Family",
  personal: "Personal",
  free: "Free time",
  other: "Other",
};

export const EVENT_KIND_COLORS: Record<EventKind, string> = {
  gym: "#f97316",
  programming: "#06b6d4",
  gaming: "#a855f7",
  entertainment: "#ec4899",
  friends: "#22c55e",
  family: "#eab308",
  personal: "#64748b",
  free: "#10b981",
  other: "#94a3b8",
};

export const EXAM_MODE_LABELS: Record<ExamMode, string> = {
  practice: "Practice",
  timed: "Timed",
  full: "Full exam",
};

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  academic: "Academic",
  study_hours: "Study hours",
  questions: "Questions",
  lessons: "Lessons",
  exams: "Exams",
  habits: "Habits",
};

export const GOAL_TRACKING_LABELS: Record<GoalTracking, string> = {
  manual: "Update manually",
  focus_hours: "Auto: focused hours",
  questions: "Auto: questions solved",
  lessons: "Auto: lessons completed",
  exams: "Auto: exams completed",
  study_days: "Auto: study days",
};

export const RATING_LABELS = ["Forgot", "Weak", "Okay", "Good", "Excellent"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function options<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

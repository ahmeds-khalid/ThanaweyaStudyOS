import type { Chapter, Lesson, LessonStatus, Subject, Unit } from "../schemas/entities";

/** Default progress implied by a status when no explicit % was recorded. */
export const STATUS_PROGRESS: Record<LessonStatus, number> = {
  not_started: 0,
  learning: 25,
  practicing: 60,
  needs_review: 85,
  completed: 100,
};

export function lessonProgress(l: Pick<Lesson, "status" | "completion">): number {
  if (l.status === "completed") return 100;
  return l.completion > 0 ? l.completion : STATUS_PROGRESS[l.status];
}

export interface CurriculumIndex {
  unitsBySubject: Map<string, Unit[]>;
  chaptersByUnit: Map<string, Chapter[]>;
  lessonsByChapter: Map<string, Lesson[]>;
  /** Lessons per subject in curriculum order (unit → chapter → lesson). */
  orderedLessonsBySubject: Map<string, Lesson[]>;
  chapterById: Map<string, Chapter>;
  unitById: Map<string, Unit>;
}

const byOrder = <T extends { order: number; createdAt: string }>(a: T, b: T) =>
  a.order - b.order || a.createdAt.localeCompare(b.createdAt);

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function buildCurriculumIndex(units: Unit[], chapters: Chapter[], lessons: Lesson[]): CurriculumIndex {
  const unitsBySubject = group([...units].sort(byOrder), (u) => u.subjectId);
  const chaptersByUnit = group([...chapters].sort(byOrder), (c) => c.unitId);
  const lessonsByChapter = group([...lessons].sort(byOrder), (l) => l.chapterId);
  const orderedLessonsBySubject = new Map<string, Lesson[]>();
  for (const [subjectId, subjectUnits] of unitsBySubject) {
    const ordered: Lesson[] = [];
    for (const u of subjectUnits) {
      for (const c of chaptersByUnit.get(u.id) ?? []) ordered.push(...(lessonsByChapter.get(c.id) ?? []));
    }
    orderedLessonsBySubject.set(subjectId, ordered);
  }
  return {
    unitsBySubject,
    chaptersByUnit,
    lessonsByChapter,
    orderedLessonsBySubject,
    chapterById: new Map(chapters.map((c) => [c.id, c])),
    unitById: new Map(units.map((u) => [u.id, u])),
  };
}

export interface SubjectProgress {
  subjectId: string;
  percent: number;
  totalLessons: number;
  completedLessons: number;
  remainingLessons: number;
  totalChapters: number;
  completedChapters: number;
  currentChapter: Chapter | null;
  nextLesson: Lesson | null;
  /** True when the % comes from the manual estimate (no lessons entered). */
  estimated: boolean;
}

export function subjectProgress(subject: Subject, idx: CurriculumIndex): SubjectProgress {
  const lessons = idx.orderedLessonsBySubject.get(subject.id) ?? [];
  const chapters = (idx.unitsBySubject.get(subject.id) ?? []).flatMap((u) => idx.chaptersByUnit.get(u.id) ?? []);
  const completedLessons = lessons.filter((l) => l.status === "completed").length;
  const completedChapters = chapters.filter((c) => {
    const ls = idx.lessonsByChapter.get(c.id) ?? [];
    return ls.length > 0 && ls.every((l) => l.status === "completed");
  }).length;
  const nextLesson = lessons.find((l) => l.status !== "completed") ?? null;
  const pinned = subject.currentChapterId ? idx.chapterById.get(subject.currentChapterId) ?? null : null;
  const currentChapter = pinned ?? (nextLesson ? idx.chapterById.get(nextLesson.chapterId) ?? null : null);
  const estimated = lessons.length === 0;
  const percent = estimated
    ? subject.manualProgress ?? 0
    : lessons.reduce((a, l) => a + lessonProgress(l), 0) / lessons.length;
  return {
    subjectId: subject.id,
    percent,
    totalLessons: lessons.length,
    completedLessons,
    remainingLessons: lessons.length - completedLessons,
    totalChapters: chapters.length,
    completedChapters,
    currentChapter,
    nextLesson,
    estimated,
  };
}

/** Unweighted mean of enabled subjects' progress. */
export function overallProgress(progress: SubjectProgress[]): number {
  if (progress.length === 0) return 0;
  return progress.reduce((a, p) => a + p.percent, 0) / progress.length;
}

export function activeSubjects(subjects: Subject[]): Subject[] {
  return subjects.filter((s) => s.enabled && !s.archived).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

import { z } from "zod";
import type { Chapter, EntityFields, Lesson, Subject, Unit } from "../schemas/entities";
import { parseCsvObjects } from "./csv";

/**
 * Curriculum import. Accepts either
 *  - JSON: { subject, units: [{ name, chapters: [{ name, lessons: [...] }] }] }
 *          (or an array of those), lessons may be strings or objects
 *  - CSV:  subject,unit,chapter,lesson,estimated_minutes,difficulty,teacher,video_url,description,topics
 * Existing subjects/units/chapters/lessons are matched by name (case-insensitive)
 * so re-importing the same file does not create duplicates.
 */

const lessonIn = z.union([
  z.string().min(1),
  z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    estimatedMinutes: z.number().int().min(0).max(1440).optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
    teacher: z.string().max(120).optional(),
    videoUrl: z.string().max(1000).optional(),
    topics: z.array(z.string().max(300)).max(200).optional(),
  }),
]);
const chapterIn = z.object({ name: z.string().min(1).max(200), lessons: z.array(lessonIn).default([]) });
const unitIn = z.object({ name: z.string().min(1).max(200), chapters: z.array(chapterIn).default([]) });
const subjectIn = z.object({ subject: z.string().min(1).max(80), units: z.array(unitIn).default([]) });
/**
 * Dataset format: { subjects: [{ name, sections: [{ name, units: [{ name, lessons: [{ name }] }] }] }] }.
 * The app's hierarchy is Subject → Unit → Chapter → Lesson, so a section becomes a unit and a dataset
 * unit becomes a chapter.
 */
const datasetLesson = z.union([z.string().min(1), z.object({ name: z.string().min(1).max(200) })]);
const datasetUnit = z.object({ name: z.string().min(1).max(200), lessons: z.array(datasetLesson).default([]) });
const datasetSection = z.object({ name: z.string().min(1).max(200), units: z.array(datasetUnit).default([]) });
const datasetSubject = z.object({ name: z.string().min(1).max(80), sections: z.array(datasetSection).default([]) });
const datasetJson = z.object({ subjects: z.array(datasetSubject).min(1) });

function fromDataset(d: z.infer<typeof datasetJson>): CurriculumJson[] {
  return d.subjects.map((sub) => ({
    subject: sub.name,
    units: sub.sections.map((sec) => ({
      name: sec.name,
      chapters: sec.units.map((u) => ({ name: u.name, lessons: u.lessons.map((l) => (typeof l === "string" ? l : l.name)) })),
    })),
  }));
}

export const curriculumJsonSchema = z.union([subjectIn, z.array(subjectIn)]);
export type CurriculumJson = z.infer<typeof subjectIn>;

export interface CurriculumImportPlan {
  subjects: (EntityFields<"subjects"> & { id: string })[];
  units: (EntityFields<"units"> & { id: string })[];
  chapters: (EntityFields<"chapters"> & { id: string })[];
  lessons: (EntityFields<"lessons"> & { id: string })[];
  skippedLessons: number;
  errors: string[];
}

interface Existing {
  subjects: Subject[];
  units: Unit[];
  chapters: Chapter[];
  lessons: Lesson[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** Same subject if the names are equal, or one contains the other as a whole word or a word prefix (Math / Mathematics). */
function sameSubject(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  const words = (t: string) => t.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const [short, long] = x.length <= y.length ? [words(x), words(y)] : [words(y), words(x)];
  return short.length > 0 && short.every((w) => w.length >= 4 && long.some((l) => l === w || l.startsWith(w)));
}

export function parseCurriculumText(text: string, filename: string): { data: CurriculumJson[]; errors: string[] } {
  const isCsv = filename.toLowerCase().endsWith(".csv") || (!text.trim().startsWith("{") && !text.trim().startsWith("["));
  if (!isCsv) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { data: [], errors: ["The file is not valid JSON."] };
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw) && "subjects" in raw) {
      const ds = datasetJson.safeParse(raw);
      if (!ds.success) {
        const i = ds.error.issues[0];
        return { data: [], errors: [`Invalid curriculum JSON at ${i.path.join(".") || "root"}: ${i.message}`] };
      }
      return { data: fromDataset(ds.data), errors: [] };
    }
    const parsed = Array.isArray(raw) ? z.array(subjectIn).safeParse(raw) : subjectIn.safeParse(raw);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return { data: [], errors: [`Invalid curriculum JSON at ${i.path.join(".") || "root"}: ${i.message}`] };
    }
    return { data: Array.isArray(parsed.data) ? parsed.data : [parsed.data], errors: [] };
  }
  const rows = parseCsvObjects(text);
  const errors: string[] = [];
  const bySubject = new Map<string, CurriculumJson>();
  rows.forEach((r, i) => {
    const subject = r.subject;
    const unit = r.unit || "Unit 1";
    const chapter = r.chapter || "Chapter 1";
    const lesson = r.lesson || r.title;
    if (!subject || !lesson) {
      errors.push(`Row ${i + 2}: "subject" and "lesson" are required.`);
      return;
    }
    const s = bySubject.get(norm(subject)) ?? { subject, units: [] };
    bySubject.set(norm(subject), s);
    let u = s.units.find((x) => norm(x.name) === norm(unit));
    if (!u) s.units.push((u = { name: unit, chapters: [] }));
    let c = u.chapters.find((x) => norm(x.name) === norm(chapter));
    if (!c) u.chapters.push((c = { name: chapter, lessons: [] }));
    const minutes = Number(r.estimated_minutes);
    const difficulty = Number(r.difficulty);
    c.lessons.push({
      title: lesson.slice(0, 200),
      description: r.description || undefined,
      estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(1440, Math.round(minutes)) : undefined,
      difficulty: difficulty >= 1 && difficulty <= 5 ? Math.round(difficulty) : undefined,
      teacher: r.teacher || undefined,
      videoUrl: r.video_url || undefined,
      topics: r.topics ? r.topics.split(";").map((t) => t.trim()).filter(Boolean) : undefined,
    });
  });
  return { data: [...bySubject.values()], errors };
}

export function planCurriculumImport(
  data: CurriculumJson[],
  existing: Existing,
  makeId: () => string,
  defaults: { lessonMinutes: number; subjectColor: (i: number) => string },
): CurriculumImportPlan {
  const plan: CurriculumImportPlan = { subjects: [], units: [], chapters: [], lessons: [], skippedLessons: 0, errors: [] };
  const live = <T extends { deletedAt: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
  const subjects = live(existing.subjects);
  const units = live(existing.units);
  const chapters = live(existing.chapters);
  const lessons = live(existing.lessons);

  data.forEach((entry) => {
    let subjectId = subjects.find((s) => norm(s.name) === norm(entry.subject))?.id ?? subjects.find((s) => sameSubject(s.name, entry.subject))?.id;
    if (!subjectId) subjectId = plan.subjects.find((s) => norm(s.name) === norm(entry.subject))?.id;
    if (!subjectId) {
      subjectId = makeId();
      plan.subjects.push({
        id: subjectId,
        isDemo: false,
        name: entry.subject,
        icon: "book-open",
        color: defaults.subjectColor(subjects.length + plan.subjects.length),
        priority: 3,
        weeklyTargetHours: 4,
        weeklySessions: 3,
        difficulty: 3,
        importance: 3,
        enabled: true,
        archived: false,
        order: subjects.length + plan.subjects.length,
        examDate: null,
        notes: "",
        manualProgress: null,
        currentChapterId: null,
      });
    }
    entry.units.forEach((u, ui) => {
      const unitsOfSubject = [...units, ...plan.units].filter((x) => x.subjectId === subjectId);
      let unitId = unitsOfSubject.find((x) => norm(x.name) === norm(u.name))?.id;
      if (!unitId) {
        unitId = makeId();
        plan.units.push({ id: unitId, isDemo: false, subjectId: subjectId!, name: u.name, order: unitsOfSubject.length + ui, notes: "" });
      }
      u.chapters.forEach((c, ci) => {
        const chaptersOfUnit = [...chapters, ...plan.chapters].filter((x) => x.unitId === unitId);
        let chapterId = chaptersOfUnit.find((x) => norm(x.name) === norm(c.name))?.id;
        if (!chapterId) {
          chapterId = makeId();
          plan.chapters.push({
            id: chapterId,
            isDemo: false,
            subjectId: subjectId!,
            unitId: unitId!,
            name: c.name,
            order: chaptersOfUnit.length + ci,
            notes: "",
          });
        }
        c.lessons.forEach((l) => {
          const lesson = typeof l === "string" ? { title: l } : l;
          const lessonsOfChapter = [...lessons, ...plan.lessons].filter((x) => x.chapterId === chapterId);
          if (lessonsOfChapter.some((x) => norm(x.title) === norm(lesson.title))) {
            plan.skippedLessons++;
            return;
          }
          plan.lessons.push({
            id: makeId(),
            isDemo: false,
            subjectId: subjectId!,
            chapterId: chapterId!,
            title: lesson.title,
            description: "description" in lesson ? lesson.description ?? "" : "",
            estimatedMinutes: ("estimatedMinutes" in lesson && lesson.estimatedMinutes) || defaults.lessonMinutes,
            status: "not_started",
            stage: "explanation",
            difficulty: ("difficulty" in lesson && lesson.difficulty) || 3,
            teacher: ("teacher" in lesson && lesson.teacher) || "",
            videoUrl: ("videoUrl" in lesson && lesson.videoUrl) || "",
            notes: "",
            topics: (("topics" in lesson && lesson.topics) || []).map((t) => ({ id: makeId(), title: t, done: false })),
            completion: 0,
            startedAt: null,
            completedAt: null,
            explanationMinutes: 0,
            practiceMinutes: 0,
            questionsAttempted: 0,
            questionsCorrect: 0,
            testScore: null,
            testTotal: null,
            order: lessonsOfChapter.length,
          });
        });
      });
    });
  });
  return plan;
}

/** Export one subject's curriculum in the same JSON shape the importer accepts. */
export function exportSubjectCurriculum(subject: Subject, units: Unit[], chapters: Chapter[], lessons: Lesson[]): CurriculumJson {
  const live = <T extends { deletedAt: string | null; order: number }>(xs: T[]) =>
    xs.filter((x) => !x.deletedAt).sort((a, b) => a.order - b.order);
  return {
    subject: subject.name,
    units: live(units.filter((u) => u.subjectId === subject.id)).map((u) => ({
      name: u.name,
      chapters: live(chapters.filter((c) => c.unitId === u.id)).map((c) => ({
        name: c.name,
        lessons: live(lessons.filter((l) => l.chapterId === c.id)).map((l) => ({
          title: l.title,
          description: l.description || undefined,
          estimatedMinutes: l.estimatedMinutes,
          difficulty: l.difficulty,
          teacher: l.teacher || undefined,
          videoUrl: l.videoUrl || undefined,
          topics: l.topics.map((t) => t.title),
        })),
      })),
    })),
  };
}

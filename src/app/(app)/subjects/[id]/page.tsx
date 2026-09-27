"use client";

import { Archive, ArrowDown, ArrowLeft, ArrowUp, BookOpen, ChevronDown, ChevronRight, Download, FileUp, Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ImportDialog } from "@/components/study/import-dialog";
import { LessonForm } from "@/components/forms/forms-b";
import { SubjectForm } from "@/components/forms/subject-form";
import { Button, ButtonLink } from "@/components/app/button";
import { Card, CardBody, Stat } from "@/components/app/card";
import { Dialog } from "@/components/app/dialog";
import { Input } from "@/components/app/form";
import { Menu, MenuItem } from "@/components/app/menu";
import { Badge, DemoBadge, EmptyState, ProgressBar, SubjectDot } from "@/components/app/misc";
import { countedSessions, questionTotals } from "@/lib/domain/analytics";
import { lessonProgress, subjectProgress } from "@/lib/domain/curriculum";
import { exportSubjectCurriculum } from "@/lib/domain/curriculum-import";
import { toCsv } from "@/lib/domain/csv";
import { formatMinutes } from "@/lib/domain/dates";
import { formatPercent } from "@/lib/domain/metrics";
import { useCurriculum } from "@/lib/hooks";
import { LESSON_STATUS_LABELS, LESSON_STATUS_TONE } from "@/lib/labels";
import type { Chapter, Lesson, Subject, Unit } from "@/lib/schemas/entities";
import { confirmAction } from "@/lib/store/confirm";
import { db, useRow, useRows } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";
import { cn, downloadFile } from "@/lib/utils";

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const subject = useRow("subjects", id);
  if (!subject) {
    return <EmptyState icon={<BookOpen />} title="Subject not found." description="It may have been deleted." action={<ButtonLink href="/subjects">Back to subjects</ButtonLink>} />;
  }
  return <SubjectView key={subject.id} subject={subject} />;
}

function SubjectView({ subject }: { subject: Subject }) {
  const router = useRouter();
  const curriculum = useCurriculum();
  const sessions = useRows("studySessions");
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lessonDialog, setLessonDialog] = useState<{ lesson?: Lesson; defaults?: Partial<Lesson> & { unitId?: string } } | null>(null);
  const units = curriculum.unitsBySubject.get(subject.id) ?? [];
  const progress = subjectProgress(subject, curriculum);
  const next = progress.nextLesson;

  // Basic statistics for this subject (all time).
  const stats = useMemo(() => {
    const own = countedSessions(sessions).filter((s) => s.subjectId === subject.id);
    const q = questionTotals(sessions, [], { start: "0000-01-01", end: "9999-12-31", subjectId: subject.id });
    return { focused: own.reduce((a, s) => a + s.focusedMinutes, 0), attempted: q.attempted, accuracy: q.accuracy };
  }, [sessions, subject.id]);

  const slug = subject.name.toLowerCase().replace(/\s+/g, "-");
  const exportJson = () => {
    const data = exportSubjectCurriculum(subject, curriculum.units, curriculum.chapters, curriculum.lessons);
    downloadFile(`curriculum-${slug}.json`, JSON.stringify(data, null, 2));
  };
  const exportCsv = () => {
    const rows = (curriculum.orderedLessonsBySubject.get(subject.id) ?? []).map((l) => {
      const ch = curriculum.chapterById.get(l.chapterId);
      const u = ch ? curriculum.unitById.get(ch.unitId) : undefined;
      return {
        subject: subject.name,
        unit: u?.name ?? "",
        chapter: ch?.name ?? "",
        lesson: l.title,
        estimated_minutes: l.estimatedMinutes,
        difficulty: l.difficulty,
        teacher: l.teacher,
        video_url: l.videoUrl,
        description: l.description,
        topics: l.topics.map((t) => t.title).join("; "),
        status: l.status,
      };
    });
    downloadFile(`curriculum-${slug}.csv`, toCsv(rows, ["subject", "unit", "chapter", "lesson", "estimated_minutes", "difficulty", "teacher", "video_url", "description", "topics", "status"]), "text/csv");
  };

  const addUnit = () => db.create("units", { subjectId: subject.id, name: `Unit ${units.length + 1}`, order: units.length });

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div>
        <Link href="/subjects" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden /> Subjects
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <SubjectDot color={subject.color} className="size-3" /> {subject.name}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => setLessonDialog({ defaults: { subjectId: subject.id } })}>
              <Plus /> Lesson
            </Button>
            <Menu label="Subject options">
              <MenuItem icon={<Pencil />} onClick={() => setEditOpen(true)}>
                Edit subject
              </MenuItem>
              <MenuItem icon={<FileUp />} onClick={() => setImportOpen(true)}>
                Import curriculum
              </MenuItem>
              <MenuItem icon={<Download />} onClick={exportJson}>
                Export JSON
              </MenuItem>
              <MenuItem icon={<Download />} onClick={exportCsv}>
                Export CSV
              </MenuItem>
              <MenuItem
                icon={<Archive />}
                onClick={() => {
                  db.update("subjects", subject.id, { archived: true });
                  toast.success("Subject archived", "Restore it from the Subjects page.");
                  router.push("/subjects");
                }}
              >
                Archive
              </MenuItem>
              <MenuItem
                danger
                icon={<Trash2 />}
                onClick={async () => {
                  const ok = await confirmAction({
                    title: `Delete ${subject.name}?`,
                    description: "Its lessons are hidden with it. You can undo right after. Consider archiving to keep history.",
                    confirmLabel: "Delete subject",
                    destructive: true,
                    typeToConfirm: subject.name,
                  });
                  if (ok) {
                    db.remove("subjects", subject.id, { label: subject.name });
                    router.push("/subjects");
                  }
                }}
              >
                Delete
              </MenuItem>
            </Menu>
          </div>
        </div>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[13px] text-muted-foreground">{progress.estimated ? "Estimated progress" : "Progress"}</span>
              <span className="tabular text-xl font-semibold">{formatPercent(progress.percent, 0)}</span>
            </div>
            <ProgressBar value={progress.percent} color={subject.color} label={`${subject.name} progress`} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Lessons" value={`${progress.completedLessons} / ${progress.totalLessons}`} />
            <Stat label="Focused" value={formatMinutes(stats.focused)} />
            <Stat label="Questions" value={stats.attempted} />
            <Stat label="Accuracy" value={formatPercent(stats.accuracy)} />
          </div>
          {next && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 p-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Current lesson</p>
                <Link href={`/lessons/${next.id}`} className="block truncate text-[15px] font-medium hover:underline">
                  {next.title}
                </Link>
              </div>
              <ButtonLink href={`/study?lesson=${next.id}&activity=${next.status === "not_started" ? "explanation" : "practice"}`} variant="primary">
                <Play /> Study
              </ButtonLink>
            </div>
          )}
        </CardBody>
      </Card>

      {units.length === 0 && (
        <EmptyState
          icon={<BookOpen />}
          title="No lessons yet."
          description="Add units and lessons, or import a JSON/CSV curriculum."
          action={
            <>
              <Button variant="primary" onClick={addUnit}>
                <Plus /> Add unit
              </Button>
              <Button onClick={() => setImportOpen(true)}>
                <FileUp /> Import
              </Button>
            </>
          }
        />
      )}

      <div className="flex flex-col gap-3">
        {units.map((u, ui) => (
          <UnitCard key={u.id} unit={u} index={ui} siblings={units} onAddLesson={(defaults) => setLessonDialog({ defaults })} onEditLesson={(lesson) => setLessonDialog({ lesson })} />
        ))}
        {units.length > 0 && (
          <Button variant="ghost" className="w-fit" onClick={addUnit}>
            <Plus /> Add unit
          </Button>
        )}
      </div>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${subject.name}`} size="lg">
        {editOpen && <SubjectForm subject={subject} count={0} onDone={() => setEditOpen(false)} />}
      </Dialog>
      <Dialog open={!!lessonDialog} onClose={() => setLessonDialog(null)} title={lessonDialog?.lesson ? "Edit lesson" : "Add lesson"} size="lg">
        {lessonDialog && <LessonForm lesson={lessonDialog.lesson} defaults={lessonDialog.defaults} onDone={() => setLessonDialog(null)} />}
      </Dialog>
    </div>
  );
}

function InlineName({ value, onSave, label, className }: { value: string; onSave: (v: string) => void; label: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <span className={cn("group/name inline-flex min-w-0 items-center gap-1.5", className)}>
        <span className="truncate">{value}</span>
        <button
          className="rounded p-0.5 text-subtle opacity-0 group-hover/name:opacity-100 hover:text-foreground focus:opacity-100"
          aria-label={`Rename ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            setDraft(value);
            setEditing(true);
          }}
        >
          <Pencil className="size-3" />
        </button>
      </span>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) onSave(draft.trim());
        setEditing(false);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Input aria-label={`New name for ${label}`} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) onSave(draft.trim()); setEditing(false); }} className="h-7 w-56" />
    </form>
  );
}

function reorder<T extends { id: string; order: number }>(entity: "units" | "chapters" | "lessons", list: T[], index: number, dir: -1 | 1) {
  const j = index + dir;
  if (j < 0 || j >= list.length) return;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  next.forEach((x, i) => x.order !== i && db.update(entity, x.id, { order: i }));
}

function UnitCard({
  unit,
  index,
  siblings,
  onAddLesson,
  onEditLesson,
}: {
  unit: Unit;
  index: number;
  siblings: Unit[];
  onAddLesson: (d: Partial<Lesson> & { unitId?: string }) => void;
  onEditLesson: (l: Lesson) => void;
}) {
  const curriculum = useCurriculum();
  const [open, setOpen] = useState(true);
  const chapters = curriculum.chaptersByUnit.get(unit.id) ?? [];
  const lessons = chapters.flatMap((c) => curriculum.lessonsByChapter.get(c.id) ?? []);
  const pct = lessons.length ? lessons.reduce((a, l) => a + lessonProgress(l), 0) / lessons.length : 0;

  return (
    <Card>
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={() => setOpen(!open)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-expanded={open} aria-label={open ? "Collapse unit" : "Expand unit"}>
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4 rtl:rotate-180" />}
        </button>
        <InlineName value={unit.name} label={unit.name} onSave={(name) => db.update("units", unit.id, { name })} className="text-sm font-semibold" />
        {unit.isDemo && <DemoBadge />}
        <span className="tabular text-xs text-muted-foreground">
          {lessons.filter((l) => l.status === "completed").length}/{lessons.length} · {formatPercent(pct, 0)}
        </span>
        <div className="ms-auto flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" aria-label="Move unit up" disabled={index === 0} onClick={() => reorder("units", siblings, index, -1)}>
            <ArrowUp />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Move unit down" disabled={index === siblings.length - 1} onClick={() => reorder("units", siblings, index, 1)}>
            <ArrowDown />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => db.create("chapters", { subjectId: unit.subjectId, unitId: unit.id, name: `Chapter ${chapters.length + 1}`, order: chapters.length })}
          >
            <Plus /> Chapter
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${unit.name}`}
            onClick={async () => {
              if (await confirmAction({ title: `Delete ${unit.name}?`, description: `Its ${chapters.length} chapters and ${lessons.length} lessons will be hidden too. You can undo right after.`, confirmLabel: "Delete", destructive: true }))
                db.remove("units", unit.id, { label: unit.name });
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
          {chapters.length === 0 && <p className="text-xs text-muted-foreground">No chapters yet.</p>}
          {chapters.map((c, ci) => (
            <ChapterBlock key={c.id} chapter={c} index={ci} siblings={chapters} onAddLesson={() => onAddLesson({ subjectId: unit.subjectId, chapterId: c.id, unitId: unit.id })} onEditLesson={onEditLesson} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ChapterBlock({ chapter, index, siblings, onAddLesson, onEditLesson }: { chapter: Chapter; index: number; siblings: Chapter[]; onAddLesson: () => void; onEditLesson: (l: Lesson) => void }) {
  const curriculum = useCurriculum();
  const lessons = curriculum.lessonsByChapter.get(chapter.id) ?? [];
  return (
    <div className="rounded-lg border border-border bg-surface-2/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <InlineName value={chapter.name} label={chapter.name} onSave={(name) => db.update("chapters", chapter.id, { name })} className="text-[13px] font-medium" />
        <span className="tabular text-xs text-muted-foreground">
          {lessons.filter((l) => l.status === "completed").length}/{lessons.length}
        </span>
        <div className="ms-auto flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" aria-label="Move chapter up" disabled={index === 0} onClick={() => reorder("chapters", siblings, index, -1)}>
            <ArrowUp />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Move chapter down" disabled={index === siblings.length - 1} onClick={() => reorder("chapters", siblings, index, 1)}>
            <ArrowDown />
          </Button>
          <Button size="xs" variant="ghost" onClick={onAddLesson}>
            <Plus /> Lesson
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${chapter.name}`}
            onClick={async () => {
              if (await confirmAction({ title: `Delete ${chapter.name}?`, description: `Its ${lessons.length} lessons will be hidden too.`, confirmLabel: "Delete", destructive: true }))
                db.remove("chapters", chapter.id, { label: chapter.name });
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {lessons.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {lessons.map((l, li) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2">
              <Link href={`/lessons/${l.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:underline">
                {l.title}
              </Link>
              {l.isDemo && <DemoBadge />}
              <span className="hidden text-xs text-muted-foreground sm:inline">{formatMinutes(l.estimatedMinutes)}</span>
              <Badge tone={LESSON_STATUS_TONE[l.status]}>{LESSON_STATUS_LABELS[l.status]}</Badge>
              <Button size="icon-sm" variant="ghost" aria-label="Move lesson up" disabled={li === 0} onClick={() => reorder("lessons", lessons, li, -1)}>
                <ArrowUp />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Move lesson down" disabled={li === lessons.length - 1} onClick={() => reorder("lessons", lessons, li, 1)}>
                <ArrowDown />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${l.title}`} onClick={() => onEditLesson(l)}>
                <Pencil />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


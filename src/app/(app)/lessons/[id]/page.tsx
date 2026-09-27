"use client";

import { ArrowLeft, BookOpen, CalendarPlus, CheckCircle2, ExternalLink, Pencil, Play, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MistakeForm } from "@/components/forms/forms-a";
import { LessonForm } from "@/components/forms/forms-b";
import { ScheduleRevisionDialog } from "@/components/study/schedule-revision";
import { Button, ButtonLink } from "@/components/app/button";
import { Card, CardBody, Stat } from "@/components/app/card";
import { Dialog } from "@/components/app/dialog";
import { Select, Textarea } from "@/components/app/form";
import { Badge, EmptyState, SubjectDot } from "@/components/app/misc";
import { completeLesson } from "@/lib/actions";
import { formatMinutes } from "@/lib/domain/dates";
import { accuracy, formatPercent } from "@/lib/domain/metrics";
import { useCurriculum, useDebouncedCallback } from "@/lib/hooks";
import { LESSON_STATUS_LABELS, LESSON_STATUS_TONE, options } from "@/lib/labels";
import type { Lesson } from "@/lib/schemas/entities";
import { confirmAction } from "@/lib/store/confirm";
import { db, useRow, useRows, useSettings } from "@/lib/store/data";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const lesson = useRow("lessons", id);
  if (!lesson) {
    return <EmptyState icon={<BookOpen />} title="Lesson not found." description="It may have been deleted." action={<ButtonLink href="/subjects">Back to subjects</ButtonLink>} />;
  }
  return <LessonView key={lesson.id} lesson={lesson} />;
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const settings = useSettings();
  const curriculum = useCurriculum();
  const subject = useRow("subjects", lesson.subjectId);
  const chapter = curriculum.chapterById.get(lesson.chapterId);
  const sessions = useRows("studySessions");
  const [editing, setEditing] = useState(false);
  const [mistakeOpen, setMistakeOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [notes, setNotes] = useState(lesson.notes);
  const saveNotes = useDebouncedCallback((value: string) => db.update("lessons", lesson.id, { notes: value }), 700);

  const focused = useMemo(
    () => sessions.filter((s) => s.lessonId === lesson.id && s.status !== "active").reduce((a, s) => a + s.focusedMinutes, 0),
    [sessions, lesson.id],
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-[var(--gap)]">
      <div>
        <Link href={`/subjects/${lesson.subjectId}`} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden /> {subject?.name ?? "Subject"}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          {subject && <SubjectDot color={subject.color} />}
          {chapter?.name}
          <Badge tone={LESSON_STATUS_TONE[lesson.status]}>{LESSON_STATUS_LABELS[lesson.status]}</Badge>
          <span>{formatMinutes(lesson.estimatedMinutes)}</span>
          {lesson.videoUrl && /^https?:\/\//.test(lesson.videoUrl) && (
            <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              <ExternalLink className="size-3" aria-hidden /> Video
            </a>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/study?lesson=${lesson.id}&activity=${lesson.status === "not_started" ? "explanation" : "practice"}`} variant="primary" size="lg">
          <Play /> Study
        </ButtonLink>
        {lesson.status !== "completed" ? (
          <Button
            size="lg"
            onClick={() => {
              completeLesson(lesson);
              if (settings.revision.askOnLessonComplete) setRevisionOpen(true);
            }}
          >
            <CheckCircle2 /> Mark complete
          </Button>
        ) : (
          <Button size="lg" variant="ghost" onClick={() => db.update("lessons", lesson.id, { status: "needs_review" })}>
            Needs review
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={() => setRevisionOpen(true)}>
          <CalendarPlus /> Schedule revision
        </Button>
        <Button size="lg" variant="ghost" onClick={() => setMistakeOpen(true)}>
          <TriangleAlert /> Add mistake
        </Button>
      </div>

      <Card>
        <CardBody className="grid grid-cols-3 gap-4">
          <Stat label="Focused" value={formatMinutes(focused)} />
          <Stat label="Questions" value={lesson.questionsAttempted} />
          <Stat label="Accuracy" value={formatPercent(accuracy(lesson.questionsCorrect, lesson.questionsAttempted))} />
        </CardBody>
      </Card>

      <div className="flex flex-col gap-2">
        <label htmlFor="lesson-notes" className="text-[13px] font-medium">
          Notes
        </label>
        <Textarea
          id="lesson-notes"
          rows={5}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            saveNotes(e.target.value);
          }}
          placeholder="Key ideas, formulas…"
        />
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Select
          aria-label="Lesson status"
          className="w-44"
          value={lesson.status}
          onChange={(e) =>
            db.update("lessons", lesson.id, {
              status: e.target.value as Lesson["status"],
              ...(e.target.value === "completed" ? { completedAt: lesson.completedAt ?? new Date().toISOString(), completion: 100 } : {}),
            })
          }
        >
          {options(LESSON_STATUS_LABELS).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </Button>
        <Button
          variant="ghost"
          className="ms-auto text-danger"
          aria-label="Delete lesson"
          onClick={async () => {
            if (await confirmAction({ title: "Delete this lesson?", description: lesson.title, confirmLabel: "Delete", destructive: true })) {
              db.remove("lessons", lesson.id, { label: "Lesson" });
              router.push(`/subjects/${lesson.subjectId}`);
            }
          }}
        >
          <Trash2 />
        </Button>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit lesson" size="lg">
        {editing && <LessonForm lesson={lesson} onDone={() => setEditing(false)} />}
      </Dialog>
      <Dialog open={mistakeOpen} onClose={() => setMistakeOpen(false)} title="Add mistake" size="lg">
        {mistakeOpen && <MistakeForm defaults={{ subjectId: lesson.subjectId, lessonId: lesson.id }} onDone={() => setMistakeOpen(false)} />}
      </Dialog>
      <ScheduleRevisionDialog lesson={lesson} open={revisionOpen} onClose={() => setRevisionOpen(false)} />
    </div>
  );
}

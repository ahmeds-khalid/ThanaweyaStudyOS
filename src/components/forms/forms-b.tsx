"use client";

import { useState } from "react";
import { DatePicker, Field, Input, NumberInput, Select, Textarea } from "@/components/app/form";
import { todayKey } from "@/lib/domain/dates";
import { examPercentage, formatPercent } from "@/lib/domain/metrics";
import { useCurriculum } from "@/lib/hooks";
import { LESSON_STATUS_LABELS, options } from "@/lib/labels";
import type { Exam, Lesson } from "@/lib/schemas/entities";
import { db } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";
import { FormGrid, SubjectSelect } from "./common";
import { FormActions } from "./forms-a";

/* ------------------------------------------------------------------ */
/* Exam: name, subject, date, score, total marks, notes                 */
/* ------------------------------------------------------------------ */

export function ExamForm({ exam, defaults, onDone }: { exam?: Exam; defaults?: Partial<Exam>; onDone: () => void }) {
  const init = { ...defaults, ...exam };
  const [name, setName] = useState(init.name ?? "");
  const [subjectId, setSubjectId] = useState<string | null>(init.subjectId ?? null);
  const [date, setDate] = useState(init.date ?? todayKey());
  const [totalMarks, setTotal] = useState<number>(init.totalMarks ?? 100);
  const [achieved, setAchieved] = useState<number | null>(init.achievedMarks ?? null);
  const [notes, setNotes] = useState(init.notes ?? "");
  const pct = examPercentage(achieved, totalMarks);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (achieved != null && achieved > totalMarks) return toast.error("Score can't be higher than total marks");
    const data = { name: name.trim(), subjectId, date, totalMarks, achievedMarks: achieved, notes, status: achieved != null ? ("completed" as const) : ("planned" as const) };
    try {
      if (exam) db.update("exams", exam.id, data);
      else db.create("exams", data);
      toast.success(exam ? "Exam updated" : "Exam added");
      onDone();
    } catch {
      /* toast shown */
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Name">{(p) => <Input {...p} required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Physics monthly test" />}</Field>
      <FormGrid>
        <Field label="Subject">{(p) => <SubjectSelect {...p} value={subjectId} onChange={setSubjectId} />}</Field>
        <Field label="Date">{(p) => <DatePicker {...p} value={date} onChange={setDate} />}</Field>
        <Field label="Score" hint="Leave empty until you have the result.">
          {(p) => <NumberInput {...p} min={0} allowEmpty value={achieved} onChange={setAchieved} />}
        </Field>
        <Field label="Total marks">{(p) => <NumberInput {...p} min={1} value={totalMarks} onChange={(v) => setTotal(v ?? 0)} />}</Field>
      </FormGrid>
      {pct != null && (
        <p className="text-[13px] text-muted-foreground">
          Percentage: <span className="tabular font-semibold text-foreground">{formatPercent(pct)}</span>
        </p>
      )}
      <Field label="Notes">{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <FormActions onCancel={onDone} submitLabel={exam ? "Save" : "Add exam"} />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Lesson: title, chapter, minutes (unit/chapter are created on demand) */
/* ------------------------------------------------------------------ */

export function LessonForm({ lesson, defaults, onDone }: { lesson?: Lesson; defaults?: Partial<Lesson> & { unitId?: string }; onDone: () => void }) {
  const { unitsBySubject, chaptersByUnit, lessonsByChapter } = useCurriculum();
  const init = { ...defaults, ...lesson };
  const subjectId = init.subjectId ?? null;
  const units = subjectId ? (unitsBySubject.get(subjectId) ?? []) : [];
  const chapters = units.flatMap((u) => (chaptersByUnit.get(u.id) ?? []).map((c) => ({ ...c, unitName: u.name })));

  const [title, setTitle] = useState(init.title ?? "");
  const [chapterId, setChapterId] = useState<string>(init.chapterId ?? chapters[chapters.length - 1]?.id ?? "__new");
  const [newChapter, setNewChapter] = useState(`Chapter ${chapters.length + 1}`);
  const [estimatedMinutes, setEstimated] = useState<number>(init.estimatedMinutes ?? 60);
  const [videoUrl, setVideoUrl] = useState(init.videoUrl ?? "");
  const [status, setStatus] = useState(init.status ?? "not_started");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) return toast.error("Open this from a subject");
    try {
      let cId = chapterId;
      if (cId === "__new") {
        const unit = units[units.length - 1] ?? db.create("units", { subjectId, name: "Unit 1", order: 0 });
        cId = db.create("chapters", { subjectId, unitId: unit.id, name: newChapter.trim() || "Chapter", order: (chaptersByUnit.get(unit.id) ?? []).length }).id;
      }
      const data = {
        subjectId,
        chapterId: cId,
        title: title.trim(),
        estimatedMinutes: Math.round(estimatedMinutes),
        videoUrl: videoUrl.trim(),
        status,
        ...(status === "completed" && !lesson?.completedAt ? { completedAt: new Date().toISOString(), completion: 100 } : {}),
        ...(lesson ? {} : { order: (lessonsByChapter.get(cId) ?? []).length }),
      };
      if (lesson) db.update("lessons", lesson.id, data);
      else db.create("lessons", data);
      toast.success(lesson ? "Lesson updated" : "Lesson added");
      onDone();
    } catch {
      /* toast shown */
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Lesson title">{(p) => <Input {...p} required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <FormGrid>
        <Field label="Chapter">
          {(p) => (
            <Select {...p} value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.unitName} › {c.name}
                </option>
              ))}
              <option value="__new">+ New chapter…</option>
            </Select>
          )}
        </Field>
        {chapterId === "__new" && <Field label="New chapter name">{(p) => <Input {...p} value={newChapter} onChange={(e) => setNewChapter(e.target.value)} />}</Field>}
        <Field label="Estimated minutes">{(p) => <NumberInput {...p} min={5} max={1440} value={estimatedMinutes} onChange={(v) => setEstimated(v ?? 60)} />}</Field>
        <Field label="Video link (optional)">{(p) => <Input {...p} type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" />}</Field>
        {lesson && (
          <Field label="Status">
            {(p) => (
              <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as Lesson["status"])}>
                {options(LESSON_STATUS_LABELS).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </FormGrid>
      <FormActions onCancel={onDone} submitLabel={lesson ? "Save" : "Add lesson"} />
    </form>
  );
}

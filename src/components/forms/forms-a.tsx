"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/app/button";
import { DatePicker, Field, Input, NumberInput, Select, Textarea } from "@/components/app/form";
import { todayKey } from "@/lib/domain/dates";
import { firstReview } from "@/lib/domain/revision";
import { MISTAKE_TYPE_LABELS, REVISION_TYPE_LABELS, options } from "@/lib/labels";
import type { Mistake, Revision, Task } from "@/lib/schemas/entities";
import { db, useSettings } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";
import { compressImage } from "@/lib/utils";
import { FormGrid, LessonSelect, SubjectSelect } from "./common";

export function FormActions({ onCancel, submitLabel = "Save", extra }: { onCancel: () => void; submitLabel?: string; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
      {extra}
      <Button onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant="primary">
        {submitLabel}
      </Button>
    </div>
  );
}

function trySave(fn: () => void, message: string, onDone: () => void) {
  try {
    fn();
    toast.success(message);
    onDone();
  } catch {
    /* validation toast already shown */
  }
}

/* ------------------------------------------------------------------ */
/* Task: just a title, optional subject and due date                    */
/* ------------------------------------------------------------------ */

export function TaskForm({ task, defaults, onDone }: { task?: Task; defaults?: Partial<Task>; onDone: () => void }) {
  const init = { ...defaults, ...task };
  const [title, setTitle] = useState(init.title ?? "");
  const [subjectId, setSubjectId] = useState<string | null>(init.subjectId ?? null);
  const [dueDate, setDueDate] = useState(init.dueDate ?? todayKey());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { title: title.trim(), subjectId, dueDate: dueDate || null, status: task?.status ?? ("today" as const) };
    trySave(() => (task ? db.update("tasks", task.id, data) : db.create("tasks", data)), task ? "Task updated" : "Task added", onDone);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Task">{(p) => <Input {...p} autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Finish the Physics problem set" maxLength={300} />}</Field>
      <FormGrid>
        <Field label="Subject (optional)">{(p) => <SubjectSelect {...p} value={subjectId} onChange={setSubjectId} />}</Field>
        <Field label="Due">{(p) => <DatePicker {...p} value={dueDate} onChange={setDueDate} clearable />}</Field>
      </FormGrid>
      <FormActions onCancel={onDone} submitLabel={task ? "Save" : "Add task"} />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Mistake: subject, lesson, question, what went wrong, method, type    */
/* ------------------------------------------------------------------ */

export function MistakeForm({ mistake, defaults, onDone }: { mistake?: Mistake; defaults?: Partial<Mistake>; onDone: () => void }) {
  const settings = useSettings();
  const init = { ...defaults, ...mistake };
  const [subjectId, setSubjectId] = useState<string | null>(init.subjectId ?? null);
  const [lessonId, setLessonId] = useState<string | null>(init.lessonId ?? null);
  const [question, setQuestion] = useState(init.question ?? "");
  const [type, setType] = useState(init.type ?? "calculation");
  const [explanation, setExplanation] = useState(init.explanation ?? "");
  const [correctMethod, setCorrectMethod] = useState(init.correctMethod ?? "");
  const [image, setImage] = useState<string | null>(init.image ?? null);
  const [preview, setPreview] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const today = todayKey();
    const data = {
      subjectId,
      lessonId,
      question: question.trim(),
      type,
      explanation,
      correctMethod,
      image,
      // A new mistake is automatically queued for its first review (interval ladder from Settings → Revision).
      ...(mistake ? {} : { occurredOn: today, nextReviewDate: firstReview(today, 0, settings.revision).date, step: 0 }),
    };
    trySave(() => (mistake ? db.update("mistakes", mistake.id, data) : db.create("mistakes", data)), mistake ? "Mistake updated" : "Mistake saved", onDone);
  };

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImage(await compressImage(file));
    } catch (err) {
      toast.error("Image not added", err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormGrid>
        <Field label="Subject">
          {(p) => (
            <SubjectSelect
              {...p}
              value={subjectId}
              onChange={(v) => {
                setSubjectId(v);
                setLessonId(null);
              }}
            />
          )}
        </Field>
        <Field label="Lesson">{(p) => <LessonSelect {...p} subjectId={subjectId} value={lessonId} onChange={setLessonId} />}</Field>
      </FormGrid>
      <Field label="Question" hint="Math is supported: $x^2$ inline, $$\int f(x)\,dx$$ for display.">
        {(p) => <Textarea {...p} required autoFocus rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />}
      </Field>
      <Field label="What went wrong?">{(p) => <Textarea {...p} rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />}</Field>
      <Field label="Correct method">{(p) => <Textarea {...p} rows={3} value={correctMethod} onChange={(e) => setCorrectMethod(e.target.value)} />}</Field>
      {(question.includes("$") || correctMethod.includes("$")) && (
        <div>
          <Button size="xs" variant="ghost" onClick={() => setPreview(!preview)}>
            {preview ? "Hide" : "Show"} math preview
          </Button>
          {preview && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <MathText text={question} />
              {correctMethod && <MathText text={correctMethod} className="text-muted-foreground" />}
            </div>
          )}
        </div>
      )}
      <FormGrid>
        <Field label="Type">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as Mistake["type"])}>
              {options(MISTAKE_TYPE_LABELS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Screenshot (optional)</span>
          {image ? (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Mistake screenshot" className="max-h-24 rounded-lg border border-border" />
              <Button size="icon-sm" variant="secondary" className="absolute top-1 end-1" aria-label="Remove image" onClick={() => setImage(null)}>
                <Trash2 />
              </Button>
            </div>
          ) : (
            <label className="flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 text-[13px] text-muted-foreground hover:bg-surface-2">
              <ImagePlus className="size-4" aria-hidden />
              Add image
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onImage(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </FormGrid>
      <FormActions onCancel={onDone} submitLabel={mistake ? "Save" : "Save mistake"} />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Revision                                                             */
/* ------------------------------------------------------------------ */

export function RevisionForm({ revision, defaults, onDone }: { revision?: Revision; defaults?: Partial<Revision>; onDone: () => void }) {
  const settings = useSettings();
  const init = { ...defaults, ...revision };
  const [title, setTitle] = useState(init.title ?? "");
  const [subjectId, setSubjectId] = useState<string | null>(init.subjectId ?? null);
  const [lessonId, setLessonId] = useState<string | null>(init.lessonId ?? null);
  const [type, setType] = useState(init.type ?? settings.revision.defaultType);
  const [scheduledDate, setDate] = useState(init.scheduledDate ?? todayKey());
  const [durationMinutes, setDuration] = useState<number>(init.durationMinutes ?? settings.revision.defaultDurationMinutes);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const lesson = db.get("lessons", lessonId);
    const data = { title: title.trim() || lesson?.title || "Revision", subjectId, lessonId, type, scheduledDate, durationMinutes };
    trySave(() => (revision ? db.update("revisions", revision.id, data) : db.create("revisions", data)), revision ? "Revision updated" : "Revision scheduled", onDone);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormGrid>
        <Field label="Subject">
          {(p) => (
            <SubjectSelect
              {...p}
              value={subjectId}
              onChange={(v) => {
                setSubjectId(v);
                setLessonId(null);
              }}
            />
          )}
        </Field>
        <Field label="Lesson">{(p) => <LessonSelect {...p} subjectId={subjectId} value={lessonId} onChange={setLessonId} />}</Field>
      </FormGrid>
      <Field label="What to revise" hint="Defaults to the lesson title.">
        {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Type">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as Revision["type"])}>
              {options(REVISION_TYPE_LABELS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Date">{(p) => <DatePicker {...p} value={scheduledDate} onChange={setDate} />}</Field>
        <Field label="Minutes">{(p) => <NumberInput {...p} min={5} max={600} value={durationMinutes} onChange={(v) => setDuration(Math.max(5, Math.round(v ?? 5)))} />}</Field>
      </div>
      <FormActions onCancel={onDone} submitLabel={revision ? "Save" : "Schedule revision"} />
    </form>
  );
}

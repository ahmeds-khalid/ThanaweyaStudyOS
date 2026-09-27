"use client";

import { useState } from "react";
import { DatePicker, Field, Input, NumberInput, Select, Textarea } from "@/components/app/form";
import { materialize } from "@/lib/actions";
import { activityLabel } from "@/lib/domain/scheduler";
import { isPlanBlockId, type Occurrence } from "@/lib/domain/weekly";
import { ACTIVITY_LABELS, options } from "@/lib/labels";
import type { ScheduleBlock } from "@/lib/schemas/entities";
import { db, useSettings } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";
import { FormGrid, LessonSelect, SubjectSelect } from "./common";
import { FormActions } from "./forms-a";

const KIND_LABELS: Partial<Record<ScheduleBlock["kind"], string>> = {
  study: "Study",
  revision: "Revision",
  catchup: "Catch-up",
  exam: "Exam",
  gym: "Gym",
  free: "Free time",
  personal: "Personal",
  break: "Break",
  meal: "Meal",
};

export function BlockForm({ block, defaults, onDone }: { block?: Occurrence; defaults?: Partial<ScheduleBlock>; onDone: () => void }) {
  const settings = useSettings();
  const init = { ...defaults, ...block };
  const [kind, setKind] = useState(init.kind ?? "study");
  const [subjectId, setSubjectId] = useState<string | null>(init.subjectId ?? null);
  const [lessonId, setLessonId] = useState<string | null>(init.lessonId ?? null);
  const [activity, setActivity] = useState(init.activity ?? "practice");
  const [title, setTitle] = useState(init.title ?? "");
  const [date, setDate] = useState(init.date ?? "");
  const [start, setStart] = useState(init.start ?? settings.study.windowStart);
  const [duration, setDuration] = useState<number>(init.durationMinutes ?? settings.study.blockMinutes);
  const [priority, setPriority] = useState<string>(init.priority ?? "");
  const [notes, setNotes] = useState(init.notes ?? "");

  const autoTitle = () => {
    const s = db.get("subjects", subjectId);
    const l = db.get("lessons", lessonId);
    return [s?.name, l?.title, kind === "study" ? activityLabel(activity) : KIND_LABELS[kind]].filter(Boolean).join(" — ");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return toast.error("Pick a date");
    const data = {
      kind,
      subjectId,
      lessonId,
      activity: kind === "study" || kind === "revision" || kind === "catchup" || kind === "exam" ? activity : null,
      title: title.trim() || (block && !block.title ? "" : autoTitle() || KIND_LABELS[kind] || "Block"),
      date,
      start,
      durationMinutes: Math.max(5, Math.round(duration)),
      priority: (priority || null) as ScheduleBlock["priority"],
      notes,
      source: "manual" as const,
    };
    try {
      if (block) db.update("scheduleBlocks", materialize(block).id, data);
      else db.create("scheduleBlocks", data);
      toast.success(block ? "Block updated" : "Block added");
      onDone();
    } catch {
      /* toast shown */
    }
  };

  const isStudy = kind === "study" || kind === "revision" || kind === "catchup" || kind === "exam";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormGrid>
        <Field label="Type">
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as ScheduleBlock["kind"])}>
              {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          )}
        </Field>
        {isStudy && (
          <Field label="Activity">
            {(p) => (
              <Select {...p} value={activity} onChange={(e) => setActivity(e.target.value as NonNullable<ScheduleBlock["activity"]>)}>
                {options(ACTIVITY_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        )}
        {isStudy && <Field label="Subject">{(p) => <SubjectSelect {...p} value={subjectId} onChange={(v) => { setSubjectId(v); setLessonId(null); }} />}</Field>}
        {isStudy && <Field label="Lesson">{(p) => <LessonSelect {...p} subjectId={subjectId} value={lessonId} onChange={setLessonId} />}</Field>}
      </FormGrid>
      <Field label="Title" hint="Leave empty to use Subject — Lesson — Activity.">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle()} />}</Field>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Date">{(p) => <DatePicker {...p} value={date} onChange={setDate} />}</Field>
        <Field label="Start">{(p) => <Input {...p} type="time" required value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Minutes">{(p) => <NumberInput {...p} min={5} max={1440} value={duration} onChange={(v) => setDuration(v ?? 5)} />}</Field>
        <Field label="Priority">
          {(p) => (
            <Select {...p} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Automatic</option>
              <option value="must">Must do</option>
              <option value="should">Should do</option>
              <option value="optional">Optional</option>
            </Select>
          )}
        </Field>
      </div>
      
      <Field label="Notes">{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      {block && isPlanBlockId(block.id) && <p className="text-xs text-muted-foreground">Only this date changes. Your weekly study plan stays the same.</p>}
      <FormActions onCancel={onDone} submitLabel={block ? "Save block" : "Add block"} />
    </form>
  );
}

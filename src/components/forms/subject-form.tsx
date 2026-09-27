"use client";

import { useState } from "react";
import { SUBJECT_ICONS } from "@/components/subject-icon";
import { DatePicker, Field, Input, NumberInput, RatingInput, Select, Textarea } from "@/components/app/form";
import { useCurriculum } from "@/lib/hooks";
import type { Subject } from "@/lib/schemas/entities";
import { db } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";
import { SUBJECT_COLORS } from "@/lib/utils";
import { FormGrid } from "./common";
import { FormActions } from "./forms-a";

export function SubjectForm({ subject, count, onDone }: { subject?: Subject; count: number; onDone: (created?: Subject) => void }) {
  const curriculum = useCurriculum();
  const [name, setName] = useState(subject?.name ?? "");
  const [icon, setIcon] = useState(subject?.icon ?? "book-open");
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[count % SUBJECT_COLORS.length]);
  const [priority, setPriority] = useState<number | null>(subject?.priority ?? 3);
  const [difficulty, setDifficulty] = useState<number | null>(subject?.difficulty ?? 3);
  const [weeklySessions, setWeeklySessions] = useState<number>(subject?.weeklySessions ?? 3);
  const [examDate, setExamDate] = useState(subject?.examDate ?? "");
  const [manualProgress, setManualProgress] = useState<number | null>(subject?.manualProgress ?? null);
  const [notes, setNotes] = useState(subject?.notes ?? "");
  const hasLessons = subject ? curriculum.lessons.some((l) => l.subjectId === subject.id) : false;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = {
          name: name.trim(),
          icon,
          color,
          priority: priority ?? 3,
          importance: priority ?? 3,
          difficulty: difficulty ?? 3,
          weeklySessions: Math.round(weeklySessions),
          weeklyTargetHours: Math.round(((weeklySessions * db.settings().study.blockMinutes) / 60) * 10) / 10,
          examDate: examDate || null,
          manualProgress,
          notes,
          ...(subject ? {} : { order: count }),
        };
        try {
          if (subject) {
            db.update("subjects", subject.id, data);
            toast.success("Subject updated");
            onDone();
          } else {
            const created = db.create("subjects", data);
            toast.success("Subject added");
            onDone(created);
          }
        } catch {
          /* toast shown */
        }
      }}
    >
      <FormGrid>
        <Field label="Name">{(p) => <Input {...p} required autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}</Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Icon">
            {(p) => (
              <Select {...p} value={icon} onChange={(e) => setIcon(e.target.value)}>
                {Object.keys(SUBJECT_ICONS).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Colour">{(p) => <input {...p} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface" />}</Field>
        </div>
        <Field label="Study blocks per week">{(p) => <NumberInput {...p} min={0} max={28} value={weeklySessions} onChange={(v) => setWeeklySessions(v ?? 0)} />}</Field>
        <Field label="Exam date (optional)">{(p) => <DatePicker {...p} value={examDate} onChange={setExamDate} clearable />}</Field>
      </FormGrid>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Priority</span>
          <RatingInput value={priority} onChange={setPriority} label="Priority" labels={["Very low", "Low", "Medium", "High", "Top"]} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Difficulty</span>
          <RatingInput value={difficulty} onChange={setDifficulty} label="Difficulty" labels={["Very easy", "Easy", "Medium", "Hard", "Very hard"]} />
        </div>
      </div>
      {!hasLessons && (
        <Field label="Estimated progress %" hint="Used until you add lessons.">
          {(p) => <NumberInput {...p} min={0} max={100} allowEmpty value={manualProgress} onChange={setManualProgress} />}
        </Field>
      )}
      <Field label="Notes">{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <FormActions onCancel={() => onDone()} submitLabel={subject ? "Save" : "Add subject"} />
    </form>
  );
}

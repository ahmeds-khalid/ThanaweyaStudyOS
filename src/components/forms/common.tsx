"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Input, Select } from "@/components/app/form";
import { useCurriculum, useSubjects } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function SubjectSelect({
  value,
  onChange,
  id,
  allowNone = true,
  noneLabel = "No subject",
  includeArchived,
  ...aria
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
  allowNone?: boolean;
  noneLabel?: string;
  includeArchived?: boolean;
  "aria-describedby"?: string;
}) {
  const { all, active } = useSubjects();
  const list = includeArchived ? all : active.length ? active : all;
  const current = value && !list.some((s) => s.id === value) ? all.find((s) => s.id === value) : undefined;
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} {...aria}>
      {allowNone && <option value="">{noneLabel}</option>}
      {!allowNone && !value && <option value="">Choose a subject…</option>}
      {current && <option value={current.id}>{current.name}</option>}
      {list.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.isDemo ? " (demo)" : ""}
        </option>
      ))}
    </Select>
  );
}

export function LessonSelect({
  subjectId,
  value,
  onChange,
  id,
  ...aria
}: {
  subjectId: string | null;
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
  "aria-describedby"?: string;
}) {
  const { orderedLessonsBySubject, chapterById, lessons } = useCurriculum();
  const list = subjectId ? orderedLessonsBySubject.get(subjectId) ?? [] : lessons;
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} disabled={list.length === 0} {...aria}>
      <option value="">{list.length === 0 ? "No lessons yet" : "No specific lesson"}</option>
      {list.map((l) => (
        <option key={l.id} value={l.id}>
          {chapterById.get(l.chapterId)?.name ? `${chapterById.get(l.chapterId)!.name} — ` : ""}
          {l.title}
          {l.status === "completed" ? " ✓" : ""}
        </option>
      ))}
    </Select>
  );
}

export function TagInput({ value, onChange, id, placeholder = "Add a tag and press Enter" }: { value: string[]; onChange: (v: string[]) => void; id?: string; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().replace(/,$/, "");
    if (t && !value.includes(t) && value.length < 30) onChange([...value, t.slice(0, 40)]);
    setDraft("");
  };
  return (
    <div className={cn("flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 focus-within:border-primary")}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-muted-foreground hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="h-7 min-w-24 flex-1 border-0 px-1 shadow-none focus:border-0 focus-visible:outline-0"
      />
    </div>
  );
}

export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

"use client";

import { useId, useState } from "react";
import { Input, Select, Switch } from "@/components/app/form";
import { deepMerge, settingsSchema, type Settings } from "@/lib/schemas/settings";
import { db, type DeepPartial } from "@/lib/store/data";
import { cn } from "@/lib/utils";

/** Returns an error message if applying the patch would make settings invalid. */
export function settingsError(patch: DeepPartial<Settings>): string | null {
  const next = deepMerge(db.settings(), patch);
  const r = settingsSchema.safeParse(next);
  if (r.success) return null;
  const issue = r.error.issues[0];
  if (!issue) return "Invalid value";
  if (issue.code === "too_small" && "minimum" in issue) return `Must be at least ${issue.minimum}`;
  if (issue.code === "too_big" && "maximum" in issue) return `Must be at most ${issue.maximum}`;
  return issue.message;
}

export function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 rounded-[var(--radius)] border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 id={`${id}-title`} className="text-sm font-semibold">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children, htmlFor, error }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string; error?: string | null }) {
  return (
    <div className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** Number input that commits on blur/Enter, only when the value is valid. */
export function NumberSetting({
  label,
  hint,
  value,
  patch,
  suffix,
  step = 1,
  scale = 1,
  integer = true,
}: {
  label: string;
  hint?: React.ReactNode;
  value: number;
  patch: (v: number) => DeepPartial<Settings>;
  suffix?: string;
  step?: number;
  /** Display multiplier (e.g. 100 to edit a 0–1 ratio as a percent). */
  scale?: number;
  integer?: boolean;
}) {
  const id = useId();
  const display = Math.round(value * scale * 100) / 100;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = Number(draft);
    if (draft.trim() === "" || Number.isNaN(n)) {
      setError("Enter a number");
      return;
    }
    const v = integer && scale === 1 ? Math.round(n) : n / scale;
    const err = settingsError(patch(v));
    if (err) {
      setError(err);
      return;
    }
    db.updateSettings(patch(v));
    setDraft(null);
    setError(null);
  };
  return (
    <Row label={label} hint={hint} htmlFor={id} error={error}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        className={cn("tabular w-24", error && "border-danger")}
        value={draft ?? String(display)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(null);
            setError(null);
          }
        }}
        aria-invalid={!!error}
      />
      {suffix && <span className="w-10 text-xs text-muted-foreground">{suffix}</span>}
    </Row>
  );
}

export function TimeSetting({ label, hint, value, patch }: { label: string; hint?: string; value: string; patch: (v: string) => DeepPartial<Settings> }) {
  const id = useId();
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <Input id={id} type="time" className="w-32" value={value} onChange={(e) => e.target.value && db.updateSettings(patch(e.target.value))} />
    </Row>
  );
}

export function ToggleSetting({ label, hint, value, patch }: { label: string; hint?: React.ReactNode; value: boolean; patch: (v: boolean) => DeepPartial<Settings> }) {
  const id = useId();
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <Switch id={id} checked={value} onChange={(v) => db.updateSettings(patch(v))} label={label} />
    </Row>
  );
}

export function SelectSetting<T extends string | number>({
  label,
  hint,
  value,
  options,
  patch,
}: {
  label: string;
  hint?: React.ReactNode;
  value: T;
  options: { value: T; label: string }[];
  patch: (v: T) => DeepPartial<Settings>;
}) {
  const id = useId();
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <Select
        id={id}
        className="w-48"
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const v = (typeof value === "number" ? Number(raw) : raw) as T;
          db.updateSettings(patch(v));
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </Select>
    </Row>
  );
}

export function TextSetting({ label, hint, value, patch, placeholder }: { label: string; hint?: string; value: string; patch: (v: string) => DeepPartial<Settings>; placeholder?: string }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <Input
        id={id}
        className="w-56"
        placeholder={placeholder}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft != null && draft !== value) db.updateSettings(patch(draft));
          setDraft(null);
        }}
      />
    </Row>
  );
}

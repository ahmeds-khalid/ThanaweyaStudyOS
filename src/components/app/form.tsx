"use client";

import { CalendarIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateFromKey, toDateKey } from "@/lib/domain/dates";
import { useFmtDate } from "@/lib/hooks";
import { Checkbox as ShCheckbox } from "@/components/ui/checkbox";
import { Field as ShField, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch as ShSwitch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export { Input, Label, Textarea };

/**
 * A native <select> styled by shadcn's NativeSelect. Pages pass plain <option>
 * children, and the browser's own picker keeps working well on phones and with
 * keyboards.
 */
export function Select({ className, children, ...props }: Omit<React.ComponentProps<"select">, "size">) {
  return (
    <NativeSelect className={cn("w-full", className)} {...props}>
      {children}
    </NativeSelect>
  );
}

/**
 * shadcn Field: label + control + hint/error, wired with ids for screen readers.
 * The child render function receives the id/aria props to spread on the control.
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <ShField className={className} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({ id, "aria-describedby": hintId, "aria-invalid": error ? true : undefined })}
      {error ? <FieldError id={hintId}>{error}</FieldError> : hint ? <FieldDescription id={hintId}>{hint}</FieldDescription> : null}
    </ShField>
  );
}

/** Date picker (shadcn Popover + Calendar) over "yyyy-MM-dd" strings. Empty string means no date. */
export function DatePicker({
  value,
  onChange,
  min,
  id,
  placeholder = "Pick a date",
  clearable,
  className,
  ...aria
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  id?: string;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fd = useFmtDate();
  const selected = value ? dateFromKey(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className={cn("w-full justify-start font-normal", !value && "text-muted-foreground", className)} {...aria}>
          <CalendarIcon data-icon="inline-start" />
          {value ? fd(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={min ? { before: dateFromKey(min) } : undefined}
          onSelect={(d) => {
            if (d) onChange(toDateKey(d));
            else if (clearable) onChange("");
            setOpen(false);
          }}
        />
        {clearable && value && (
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { onChange(""); setOpen(false); }}>
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return <ShSwitch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} disabled={disabled} />;
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  hideLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  className?: string;
  hideLabel?: boolean;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <ShCheckbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
    </label>
  );
}

/** Number input that emits numbers (or null when empty if allowed). */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  allowEmpty,
  className,
  ...rest
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: number | null;
  onChange: (v: number | null) => void;
  allowEmpty?: boolean;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      className={cn("tabular", className)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(allowEmpty ? null : 0);
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
      {...rest}
    />
  );
}

/** Single-choice toggle buttons (shadcn ToggleGroup). A choice can't be un-selected. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size === "sm" ? "sm" : "default"}
      spacing={0}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={className}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** 1–5 rating buttons with labels for screen readers. */
export function RatingInput({ value, onChange, label, labels }: { value: number | null; onChange: (v: number | null) => void; label: string; labels?: string[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={labels?.[n - 1] ? `${n} — ${labels[n - 1]}` : String(n)}
          title={labels?.[n - 1]}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "flex h-8 min-w-8 flex-1 items-center justify-center rounded-lg border text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            value === n ? "border-primary bg-primary text-primary-foreground" : "border-input bg-transparent hover:bg-muted",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** 1–5 stars (click the same star again to clear). */
export function StarInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of 5`}
          onClick={() => onChange(value === n ? null : n)}
          className={cn("rounded p-0.5 text-2xl leading-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", value != null && n <= value ? "text-warning" : "text-border hover:text-muted-foreground")}
        >
          {value != null && n <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

"use client";

import { EyeOff } from "lucide-react";
import { formatCountdown } from "@/lib/domain/dates";
import { displayState, progress, remainingMs, type TimerState } from "@/lib/domain/timer";
import { cn } from "@/lib/utils";

const STATE_LABEL = {
  idle: "Ready",
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
  paused: "Paused",
  completed: "Phase complete",
};

export function phaseLabel(timer: TimerState) {
  const st = displayState(timer);
  if (st === "paused") return `Paused · ${timer.phase === "focus" ? "Focus" : "Break"}`;
  if (st === "completed") return `Up next: ${timer.phase === "focus" ? "Focus" : timer.phase === "long_break" ? "Long break" : "Short break"}`;
  return STATE_LABEL[st];
}

/**
 * Timer face. Remaining time is derived from timestamps on every render, so
 * it is exact regardless of how often the component re-renders.
 */
export function TimerDisplay({
  timer,
  now,
  style,
  showRemaining,
  size = "lg",
}: {
  timer: TimerState;
  now: number;
  style: "ring" | "digital" | "minimal";
  showRemaining: boolean;
  size?: "md" | "lg" | "xl";
}) {
  const remaining = remainingMs(timer, now);
  const p = progress(timer, now);
  const isBreak = timer.phase !== "focus";
  const color = isBreak ? "var(--success)" : "var(--primary)";
  const label = phaseLabel(timer);
  const text = showRemaining ? formatCountdown(remaining) : null;
  const dims = { md: 200, lg: 260, xl: 320 }[size];
  const fontSize = { md: "text-4xl", lg: "text-5xl", xl: "text-6xl" }[size];

  const hidden = (
    <span className="flex flex-col items-center gap-1 text-muted-foreground">
      <EyeOff className="size-6" aria-hidden />
      <span className="text-xs">Time hidden</span>
    </span>
  );

  if (style === "minimal") {
    return (
      <div className="flex flex-col items-center gap-2" role="timer" aria-live="off" aria-label={`${label}${text ? `, ${text} remaining` : ""}`}>
        <span className="text-sm font-medium" style={{ color }}>
          {label}
        </span>
        {text ? <span className={cn("tabular font-light tracking-tight", fontSize)}>{text}</span> : hidden}
      </div>
    );
  }

  if (style === "digital") {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-3" role="timer" aria-live="off" aria-label={`${label}${text ? `, ${text} remaining` : ""}`}>
        <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ color, background: isBreak ? "var(--success-soft)" : "var(--accent-soft)" }}>
          {label}
        </span>
        {text ? <span className={cn("tabular font-semibold tracking-tight", fontSize)}>{text}</span> : hidden}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${p * 100}%`, background: color }} />
        </div>
      </div>
    );
  }

  const stroke = 10;
  const r = (dims - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: dims, height: dims }} role="timer" aria-live="off" aria-label={`${label}${text ? `, ${text} remaining` : ""}`}>
      <svg width={dims} height={dims} className="-rotate-90" aria-hidden>
        <circle cx={dims / 2} cy={dims / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={dims / 2}
          cy={dims / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        {text ? <span className={cn("tabular font-semibold tracking-tight", fontSize)}>{text}</span> : hidden}
        <span className="text-[13px] font-medium" style={{ color }}>
          {label}
        </span>
      </div>
    </div>
  );
}

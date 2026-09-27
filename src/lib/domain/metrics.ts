import type { Settings } from "../schemas/settings";

/** Percentage correct of attempted questions, or null when nothing was attempted. */
export function accuracy(correct: number, attempted: number): number | null {
  if (!attempted || attempted <= 0) return null;
  return (Math.min(correct, attempted) / attempted) * 100;
}

/** Minutes per attempted question, or null if unknown. */
export function avgTimePerQuestion(totalMinutes: number | null | undefined, attempted: number): number | null {
  if (totalMinutes == null || !attempted || attempted <= 0) return null;
  return totalMinutes / attempted;
}

export function examPercentage(achieved: number | null | undefined, total: number): number | null {
  if (achieved == null || !total || total <= 0) return null;
  return (achieved / total) * 100;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(digits));
  return `${rounded}%`;
}

/** "1m 30s"-style for fractional minutes. */
export function formatMinutesPrecise(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const totalSec = Math.round(minutes * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/* ------------------------------------------------------------------ */
/* Workload indicator                                                   */
/* ------------------------------------------------------------------ */

export type WorkloadLevel = "light" | "normal" | "heavy" | "overloaded";

/**
 * Classifies planned focused minutes using the user's configurable
 * thresholds. These labels describe the plan relative to the user's own
 * settings; they are not a claim about what is objectively optimal.
 */
export function workloadLevel(minutes: number, w: Settings["workload"]): WorkloadLevel {
  if (minutes < w.lightBelow) return "light";
  if (minutes < w.normalBelow) return "normal";
  if (minutes < w.heavyBelow) return "heavy";
  return "overloaded";
}

/* ------------------------------------------------------------------ */
/* Optional consistency score (transparent formula, off by default)     */
/* ------------------------------------------------------------------ */

export const CONSISTENCY_FORMULA =
  "score = 50 × (completed study blocks ÷ planned study blocks) + 30 × min(1, focused minutes ÷ target minutes) + 20 × (revisions done ÷ revisions due)";

export function consistencyScore(input: {
  plannedBlocks: number;
  completedBlocks: number;
  focusedMinutes: number;
  targetMinutes: number;
  revisionsDue: number;
  revisionsDone: number;
}): number | null {
  const parts: { weight: number; value: number }[] = [];
  if (input.plannedBlocks > 0) parts.push({ weight: 50, value: Math.min(1, input.completedBlocks / input.plannedBlocks) });
  if (input.targetMinutes > 0) parts.push({ weight: 30, value: Math.min(1, input.focusedMinutes / input.targetMinutes) });
  if (input.revisionsDue > 0) parts.push({ weight: 20, value: Math.min(1, input.revisionsDone / input.revisionsDue) });
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  return Math.round((parts.reduce((a, p) => a + p.weight * p.value, 0) / totalWeight) * 100);
}

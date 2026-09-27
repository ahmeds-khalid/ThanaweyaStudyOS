import type { RatingEffect, Settings } from "../schemas/settings";
import { addDays } from "./dates";

/**
 * Revision scheduling.
 *
 * Uses a configurable "interval ladder" (default 1, 3, 7, 14, 30 days). These
 * values are editable defaults, not a claim about optimal spacing. After each
 * review the self-rating (1–5) moves the item along the ladder according to
 * the configurable rating effects:
 *   reset  → back to the first interval
 *   back   → one rung down
 *   repeat → same interval again
 *   next   → one rung up
 *   skip   → two rungs up
 * Past the last rung, intervals keep growing by `growthAfterLast`.
 */

export type RevisionConfig = Settings["revision"];

export function applyRatingEffect(step: number, effect: RatingEffect): number {
  switch (effect) {
    case "reset":
      return 0;
    case "back":
      return Math.max(0, step - 1);
    case "repeat":
      return step;
    case "next":
      return step + 1;
    case "skip":
      return step + 2;
  }
}

export function intervalForStep(step: number, cfg: Pick<RevisionConfig, "intervals" | "growthAfterLast">): number {
  const { intervals, growthAfterLast } = cfg;
  if (intervals.length === 0) return 1;
  if (step < intervals.length) return intervals[Math.max(0, step)];
  const last = intervals[intervals.length - 1];
  const extra = step - intervals.length + 1;
  return Math.min(365, Math.round(last * Math.pow(growthAfterLast, extra)));
}

export interface NextReview {
  step: number;
  intervalDays: number;
  date: string;
}

/** Given a review done on `reviewedOn` at `step` with `rating`, when is the next one? */
export function nextReview(reviewedOn: string, step: number, rating: number, cfg: RevisionConfig): NextReview {
  const key = String(Math.min(5, Math.max(1, Math.round(rating)))) as keyof RevisionConfig["ratingEffects"];
  const newStep = applyRatingEffect(step, cfg.ratingEffects[key]);
  const intervalDays = intervalForStep(newStep, cfg);
  return { step: newStep, intervalDays, date: addDays(reviewedOn, intervalDays) };
}

/** First revision after completing a lesson, at the chosen ladder rung. */
export function firstReview(completedOn: string, step: number, cfg: RevisionConfig): NextReview {
  const intervalDays = intervalForStep(step, cfg);
  return { step, intervalDays, date: addDays(completedOn, intervalDays) };
}

/** All ladder dates from a start day, e.g. for "schedule the full ladder". */
export function ladderDates(from: string, cfg: RevisionConfig): NextReview[] {
  return cfg.intervals.map((intervalDays, step) => ({ step, intervalDays, date: addDays(from, intervalDays) }));
}

export type DueBucket = "overdue" | "today" | "upcoming";

export function dueBucket(date: string, today: string): DueBucket {
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "upcoming";
}

"use client";

import { useMemo } from "react";
import { countedSessions, sessionDate } from "./domain/analytics";
import { combine } from "./domain/dates";
import { FOCUS_KINDS } from "./domain/scheduler";
import type { ScheduleBlock, StudySession } from "./schemas/entities";
import type { Settings } from "./schemas/settings";
import { useRows, useSettings } from "./store/data";

export interface DayStats {
  plannedMinutes: number;
  plannedBlocks: number;
  completedBlocks: number;
  remainingBlocks: number;
  focusedMinutes: number;
  remainingMinutes: number;
  /** Percent of today's plan done (or of the daily target when nothing is planned). */
  percent: number;
  /** Target used for "study target completed": the smaller of the plan and the daily target. */
  targetMinutes: number;
  targetReached: boolean;
}

export function dayStats(date: string, blocks: ScheduleBlock[], sessions: StudySession[], settings: Settings): DayStats {
  const focus = blocks.filter((b) => b.date === date && !b.deletedAt && FOCUS_KINDS.has(b.kind) && b.status !== "rescheduled" && b.status !== "skipped");
  const plannedMinutes = focus.reduce((a, b) => a + b.durationMinutes, 0);
  const completedBlocks = focus.filter((b) => b.status === "completed").length;
  const focusedMinutes = countedSessions(sessions)
    .filter((s) => sessionDate(s) === date)
    .reduce((a, s) => a + s.focusedMinutes, 0);
  const targetMinutes = plannedMinutes > 0 ? Math.min(plannedMinutes, settings.study.dailyTargetMinutes) : settings.study.dailyTargetMinutes;
  const denominator = plannedMinutes > 0 ? plannedMinutes : settings.study.dailyTargetMinutes;
  const allPlannedDone = focus.length > 0 && completedBlocks === focus.length;
  return {
    plannedMinutes,
    plannedBlocks: focus.length,
    completedBlocks,
    remainingBlocks: focus.length - completedBlocks,
    focusedMinutes,
    remainingMinutes: Math.max(0, plannedMinutes - focusedMinutes),
    percent: denominator > 0 ? Math.min(100, (focusedMinutes / denominator) * 100) : 0,
    targetMinutes,
    targetReached: targetMinutes > 0 && (focusedMinutes >= targetMinutes || allPlannedDone),
  };
}

export function useDayStats(date: string) {
  const blocks = useRows("scheduleBlocks");
  const sessions = useRows("studySessions");
  const settings = useSettings();
  return useMemo(() => dayStats(date, blocks, sessions, settings), [date, blocks, sessions, settings]);
}

/** The next block to work on: in progress, else the earliest upcoming today (not yet ended). */
export function nextBlock(blocks: ScheduleBlock[], today: string, now: number): ScheduleBlock | null {
  const focus = blocks
    .filter((b) => !b.deletedAt && FOCUS_KINDS.has(b.kind) && (b.status === "upcoming" || b.status === "in_progress") && b.date >= today)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const inProgress = focus.find((b) => b.status === "in_progress");
  if (inProgress) return inProgress;
  return focus.find((b) => combine(b.date, b.start).getTime() + b.durationMinutes * 60_000 > now) ?? null;
}

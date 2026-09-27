import { describe, expect, it } from "vitest";
import {
  advance,
  createTimer,
  displayState,
  elapsedMs,
  pause,
  remainingMs,
  restartPhase,
  skip,
  start,
  totalFocusedMs,
  type TimerConfig,
} from "./timer";

const cfg: TimerConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 3,
  autoStartFocus: true,
  autoStartBreaks: true,
};
const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);

describe("pomodoro timer", () => {
  it("derives remaining time from timestamps, not ticks", () => {
    const s = start(createTimer(cfg), T0);
    expect(remainingMs(s, T0)).toBe(25 * MIN);
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN);
    // A throttled/hidden tab that re-renders 24 minutes later is still exact.
    expect(remainingMs(s, T0 + 24 * MIN + 30_000)).toBe(30_000);
  });

  it("pauses and resumes without losing or gaining time", () => {
    let s = start(createTimer(cfg), T0);
    s = pause(s, T0 + 10 * MIN);
    expect(displayState(s)).toBe("paused");
    // Time passing while paused does not count.
    expect(remainingMs(s, T0 + 60 * MIN)).toBe(15 * MIN);
    s = start(s, T0 + 60 * MIN);
    expect(remainingMs(s, T0 + 65 * MIN)).toBe(10 * MIN);
    expect(elapsedMs(s, T0 + 65 * MIN)).toBe(15 * MIN);
  });

  it("closes a finished phase at its exact end time and starts a break", () => {
    const s = start(createTimer(cfg), T0);
    const { state, finished } = advance(s, T0 + 26 * MIN, cfg);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ phase: "focus", endedAt: T0 + 25 * MIN, completed: true });
    expect(state.phase).toBe("short_break");
    expect(state.status).toBe("running");
    // The break started when focus ended, not when we noticed.
    expect(remainingMs(state, T0 + 26 * MIN)).toBe(4 * MIN);
  });

  it("catches up on several phases after the tab was asleep", () => {
    const s = start(createTimer(cfg), T0);
    // focus 25 + break 5 + focus 25 = 55 minutes, then 2 more minutes into a break
    const { state, finished } = advance(s, T0 + 57 * MIN, cfg);
    expect(finished.map((f) => f.phase)).toEqual(["focus", "short_break", "focus"]);
    expect(state.phase).toBe("short_break");
    expect(state.completedFocus).toBe(2);
    expect(remainingMs(state, T0 + 57 * MIN)).toBe(3 * MIN);
    expect(totalFocusedMs(state, T0 + 57 * MIN)).toBe(50 * MIN);
  });

  it("takes a long break after the configured number of cycles", () => {
    let s = start(createTimer(cfg), T0);
    const r = advance(s, T0 + (25 + 5 + 25 + 5 + 25) * MIN + 1, cfg);
    s = r.state;
    expect(s.completedFocus).toBe(3);
    expect(s.phase).toBe("long_break");
    expect(s.phaseDurationMs).toBe(15 * MIN);
  });

  it("waits for the user when auto-start is off", () => {
    const manual = { ...cfg, autoStartBreaks: false };
    const s = start(createTimer(manual), T0);
    const { state } = advance(s, T0 + 30 * MIN, manual);
    expect(state.status).toBe("finished");
    expect(displayState(state)).toBe("completed");
    expect(state.phase).toBe("short_break");
    expect(remainingMs(state, T0 + 40 * MIN)).toBe(5 * MIN);
  });

  it("skip records partial focus and does not count a cycle", () => {
    const s = start(createTimer(cfg), T0);
    const { state, finished } = skip(s, T0 + 10 * MIN, cfg);
    expect(finished).toMatchObject({ phase: "focus", actualMs: 10 * MIN, completed: false });
    expect(state.completedFocus).toBe(0);
    expect(state.focusedMsBefore).toBe(10 * MIN);
    expect(state.phase).toBe("short_break");
  });

  it("restart resets only the current phase", () => {
    let s = start(createTimer(cfg), T0);
    s = advance(s, T0 + 26 * MIN, cfg).state; // in short break, 1 focus done
    s = restartPhase(s, T0 + 27 * MIN);
    expect(s.completedFocus).toBe(1);
    expect(remainingMs(s, T0 + 27 * MIN)).toBe(5 * MIN);
  });
});

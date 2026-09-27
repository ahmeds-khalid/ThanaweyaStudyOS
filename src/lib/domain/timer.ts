/**
 * Pomodoro timer state machine.
 *
 * The timer never counts down by decrementing state on an interval. It stores
 * timestamps and derives the remaining time from `now`, so it stays accurate
 * when the tab is throttled, hidden, asleep, or reloaded (state is persisted).
 * UI code calls `advance(state, now)` whenever it re-renders or regains focus;
 * any phases that ended in the meantime are closed at their exact end time.
 */

export type TimerPhase = "focus" | "short_break" | "long_break";
export type TimerStatus = "idle" | "running" | "paused" | "finished";

export interface TimerConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoStartFocus: boolean;
  autoStartBreaks: boolean;
}

export interface TimerState {
  status: TimerStatus;
  phase: TimerPhase;
  phaseDurationMs: number;
  /** Epoch ms when the current running segment began (null unless running). */
  segmentStartedAt: number | null;
  /** Elapsed ms from earlier segments of this phase (before pauses). */
  elapsedBeforeMs: number;
  /** Epoch ms when this phase first started (for logging). */
  phaseStartedAt: number | null;
  /** Focus phases completed since the timer was reset. */
  completedFocus: number;
  /** Total focused ms across completed + current focus phases. */
  focusedMsBefore: number;
}

export interface FinishedPhase {
  phase: TimerPhase;
  startedAt: number;
  endedAt: number;
  plannedMs: number;
  actualMs: number;
  completed: boolean;
}

export const phaseMinutes = (cfg: TimerConfig, phase: TimerPhase) =>
  phase === "focus" ? cfg.focusMinutes : phase === "short_break" ? cfg.shortBreakMinutes : cfg.longBreakMinutes;

export function createTimer(cfg: TimerConfig, phase: TimerPhase = "focus"): TimerState {
  return {
    status: "idle",
    phase,
    phaseDurationMs: phaseMinutes(cfg, phase) * 60_000,
    segmentStartedAt: null,
    elapsedBeforeMs: 0,
    phaseStartedAt: null,
    completedFocus: 0,
    focusedMsBefore: 0,
  };
}

export function elapsedMs(s: TimerState, now: number): number {
  const running = s.status === "running" && s.segmentStartedAt != null ? now - s.segmentStartedAt : 0;
  return Math.max(0, s.elapsedBeforeMs + running);
}

export function remainingMs(s: TimerState, now: number): number {
  return Math.max(0, s.phaseDurationMs - elapsedMs(s, now));
}

export function progress(s: TimerState, now: number): number {
  return s.phaseDurationMs > 0 ? Math.min(1, elapsedMs(s, now) / s.phaseDurationMs) : 0;
}

/** Total focused time, including the running focus phase. */
export function totalFocusedMs(s: TimerState, now: number): number {
  return s.focusedMsBefore + (s.phase === "focus" ? Math.min(elapsedMs(s, now), s.phaseDurationMs) : 0);
}

export function start(s: TimerState, now: number): TimerState {
  if (s.status === "running") return s;
  return {
    ...s,
    status: "running",
    segmentStartedAt: now,
    phaseStartedAt: s.phaseStartedAt ?? now,
    elapsedBeforeMs: s.status === "finished" ? 0 : s.elapsedBeforeMs,
  };
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== "running") return s;
  return { ...s, status: "paused", elapsedBeforeMs: elapsedMs(s, now), segmentStartedAt: null };
}

export function toggle(s: TimerState, now: number): TimerState {
  return s.status === "running" ? pause(s, now) : start(s, now);
}

/** Restart the current phase from zero (keeps cycle count). */
export function restartPhase(s: TimerState, now: number, keepRunning = true): TimerState {
  return {
    ...s,
    status: keepRunning ? "running" : "idle",
    elapsedBeforeMs: 0,
    segmentStartedAt: keepRunning ? now : null,
    phaseStartedAt: keepRunning ? now : null,
  };
}

export function nextPhaseAfter(phase: TimerPhase, completedFocus: number, cfg: TimerConfig): TimerPhase {
  if (phase !== "focus") return "focus";
  return completedFocus > 0 && completedFocus % cfg.cyclesBeforeLongBreak === 0 ? "long_break" : "short_break";
}

function enterPhase(s: TimerState, phase: TimerPhase, cfg: TimerConfig, at: number, autoStart: boolean): TimerState {
  return {
    ...s,
    phase,
    phaseDurationMs: phaseMinutes(cfg, phase) * 60_000,
    status: autoStart ? "running" : "finished",
    elapsedBeforeMs: 0,
    segmentStartedAt: autoStart ? at : null,
    phaseStartedAt: autoStart ? at : null,
  };
}

/**
 * Close any phases that have ended by `now`. Returns the new state plus the
 * list of finished phases (in order) so the caller can log/notify.
 */
export function advance(s: TimerState, now: number, cfg: TimerConfig): { state: TimerState; finished: FinishedPhase[] } {
  const finished: FinishedPhase[] = [];
  let state = s;
  // Guard against pathological loops (e.g. clock jumped by weeks).
  for (let i = 0; i < 500; i++) {
    if (state.status !== "running" || state.segmentStartedAt == null) break;
    const remaining = remainingMs(state, now);
    if (remaining > 0) break;
    const endedAt = state.segmentStartedAt + (state.phaseDurationMs - state.elapsedBeforeMs);
    finished.push({
      phase: state.phase,
      startedAt: state.phaseStartedAt ?? endedAt - state.phaseDurationMs,
      endedAt,
      plannedMs: state.phaseDurationMs,
      actualMs: state.phaseDurationMs,
      completed: true,
    });
    const wasFocus = state.phase === "focus";
    const completedFocus = state.completedFocus + (wasFocus ? 1 : 0);
    const focusedMsBefore = state.focusedMsBefore + (wasFocus ? state.phaseDurationMs : 0);
    const next = nextPhaseAfter(state.phase, completedFocus, cfg);
    const auto = next === "focus" ? cfg.autoStartFocus : cfg.autoStartBreaks;
    state = enterPhase({ ...state, completedFocus, focusedMsBefore }, next, cfg, endedAt, auto);
  }
  return { state, finished };
}

/**
 * Skip the current phase immediately (records it as not completed).
 */
export function skip(s: TimerState, now: number, cfg: TimerConfig): { state: TimerState; finished: FinishedPhase | null } {
  const elapsed = Math.min(elapsedMs(s, now), s.phaseDurationMs);
  const hadStarted = s.phaseStartedAt != null;
  const finished: FinishedPhase | null = hadStarted
    ? {
        phase: s.phase,
        startedAt: s.phaseStartedAt!,
        endedAt: now,
        plannedMs: s.phaseDurationMs,
        actualMs: elapsed,
        completed: false,
      }
    : null;
  const focusedMsBefore = s.focusedMsBefore + (s.phase === "focus" ? elapsed : 0);
  const next = nextPhaseAfter(s.phase, s.completedFocus, cfg);
  // A skipped focus phase does not count toward the long-break cycle.
  const nextPhase = s.phase === "focus" ? "short_break" : next;
  const auto = nextPhase === "focus" ? cfg.autoStartFocus : cfg.autoStartBreaks;
  return { state: enterPhase({ ...s, focusedMsBefore }, nextPhase, cfg, now, auto), finished };
}

/** Apply new durations; the running phase keeps its elapsed time. */
export function reconfigure(s: TimerState, cfg: TimerConfig): TimerState {
  return { ...s, phaseDurationMs: phaseMinutes(cfg, s.phase) * 60_000 };
}

export type TimerDisplayState = "idle" | "focus" | "short_break" | "long_break" | "paused" | "completed";

export function displayState(s: TimerState): TimerDisplayState {
  if (s.status === "idle") return "idle";
  if (s.status === "paused") return "paused";
  if (s.status === "finished") return "completed";
  return s.phase;
}

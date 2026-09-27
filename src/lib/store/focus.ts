"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ActivityType } from "../schemas/entities";
import { POMODORO_PRESETS, type Settings } from "../schemas/settings";
import { startDelayMinutes } from "../domain/timeline";
import * as T from "../domain/timer";
import { notify } from "../focus/notify";
import { playSound, unlockAudio } from "../focus/sound";
import { db } from "./data";
import { toast } from "./toast";
import { enterFullscreen, ui } from "./ui";

/**
 * The single global focus timer, shared by the Pomodoro page and study
 * sessions. Persisted to localStorage so a reload, crash or closed tab never
 * loses the running timer — remaining time is always derived from stored
 * timestamps (see domain/timer.ts).
 */

export type PresetKey = "classic" | "deep" | "long" | "custom";
export const STARTER_MINUTES = 5;

export interface SessionSetup {
  subjectId: string | null;
  lessonId: string | null;
  blockId: string | null;
  activity: ActivityType;
  title: string;
  plannedMinutes: number | null;
  preset: PresetKey;
  phoneAway: boolean;
  focusMode: boolean;
  starter?: boolean;
}

export interface ActiveSession extends Omit<SessionSetup, "phoneAway" | "focusMode"> {
  sessionId: string;
  startedAt: number;
  /** Wall time of finished phases (focus + breaks), excluding pauses. */
  activeMsBefore: number;
  interruptions: number;
  phoneChecks: number;
  starterContinued: boolean | null;
  endedAt: number | null;
}

export type FocusStage = "idle" | "phone" | "running" | "starter_check" | "review";

interface FocusState {
  timer: T.TimerState;
  config: T.TimerConfig;
  preset: PresetKey;
  stage: FocusStage;
  pendingSetup: SessionSetup | null;
  session: ActiveSession | null;
}

export function configFor(settings: Settings, preset: PresetKey): T.TimerConfig {
  const p = settings.pomodoro;
  const base = preset === "custom" ? p : POMODORO_PRESETS[preset];
  return {
    focusMinutes: base.focusMinutes,
    shortBreakMinutes: base.shortBreakMinutes,
    longBreakMinutes: base.longBreakMinutes,
    cyclesBeforeLongBreak: base.cyclesBeforeLongBreak,
    autoStartFocus: p.autoStartFocus,
    autoStartBreaks: p.autoStartBreaks,
  };
}

/** The preset key matching the user's settings (custom when edited). */
export function settingsPreset(settings: Settings): PresetKey {
  return settings.pomodoro.preset;
}

const starterConfig = (cfg: T.TimerConfig): T.TimerConfig => ({ ...cfg, focusMinutes: STARTER_MINUTES, autoStartBreaks: false });

export const useFocus = create<FocusState>()(
  persist(
    (): FocusState => {
      const cfg = configFor(db.settings(), "custom");
      return {
        timer: T.createTimer(cfg),
        config: cfg,
        preset: "custom" as PresetKey,
        stage: "idle" as FocusStage,
        pendingSetup: null,
        session: null,
      };
    },
    // Rehydrated explicitly after mount (see Providers) to keep SSR markup stable.
    { name: "sos-focus-v1", storage: createJSONStorage(() => localStorage), version: 1, skipHydration: true },
  ),
);

const set = useFocus.setState;
const get = useFocus.getState;

/* ------------------------------------------------------------------ */

export function sessionActiveMs(s: FocusState, now: number): number {
  if (!s.session) return 0;
  return s.session.activeMsBefore + (s.timer.phaseStartedAt ? T.elapsedMs(s.timer, now) : 0);
}

function logPhase(p: T.FinishedPhase, sessionId: string | null, subjectId: string | null) {
  if (p.actualMs < 30_000) return; // ignore accidental starts
  try {
    db.create("pomodoroSessions", {
      sessionId,
      subjectId,
      phase: p.phase,
      startedAt: new Date(p.startedAt).toISOString(),
      endedAt: new Date(p.endedAt).toISOString(),
      plannedSeconds: Math.round(p.plannedMs / 1000),
      actualSeconds: Math.round(p.actualMs / 1000),
      completed: p.completed,
    });
  } catch {
    /* validation toast already shown */
  }
}

function alert(title: string, body: string) {
  const settings = db.settings();
  if (settings.pomodoro.sound && settings.notifications.sound) playSound(settings.pomodoro.soundType, settings.pomodoro.volume);
  if (settings.pomodoro.notification) void notify(title, body, { browser: settings.notifications.browser, tag: "pomodoro" });
}

const PHASE_LABEL: Record<T.TimerPhase, string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };

/**
 * Advance the timer to `now`: close finished phases, log them, alert, and
 * end the study session when its planned time is used up.
 */
export function tick(now = Date.now()) {
  const s = get();
  if (s.timer.status !== "running") return;
  const { state, finished } = T.advance(s.timer, now, s.config);
  let session = s.session;
  for (const f of finished) {
    logPhase(f, session?.sessionId ?? null, session?.subjectId ?? null);
    if (session) session = { ...session, activeMsBefore: session.activeMsBefore + f.actualMs };
  }
  if (finished.length > 0) set({ timer: state, session });

  if (session && s.stage === "running") {
    if (session.starter) {
      if (finished.some((f) => f.phase === "focus")) {
        set({ stage: "starter_check" });
        alert("5 minutes done", "Nice start. Continue or stop — both are fine.");
      }
      return;
    }
    if (session.plannedMinutes) {
      // Planned session length reached: end exactly at that moment.
      const plannedMs = session.plannedMinutes * 60_000;
      const total = sessionActiveMs(get(), now);
      if (total >= plannedMs) {
        finishSession(Math.max(session.startedAt, now - (total - plannedMs)), "time");
        return;
      }
    }
  }
  if (finished.length === 0) return;
  const last = finished[finished.length - 1];
  const next = PHASE_LABEL[state.phase];
  if (last.phase === "focus") alert("Focus complete", `Time for a ${next.toLowerCase()}.`);
  else alert("Break over", "Ready for the next focus block?");
}

/* ------------------------------------------------------------------ */
/* Standalone Pomodoro                                                  */
/* ------------------------------------------------------------------ */

export function startPomodoro(preset?: PresetKey) {
  unlockAudio();
  const s = get();
  const now = Date.now();
  if (s.timer.status === "paused" || s.timer.status === "finished") {
    set({ timer: T.start(s.timer, now) });
    return;
  }
  if (s.timer.status === "running") return;
  const p = preset ?? s.preset;
  const cfg = configFor(db.settings(), p);
  set({ config: cfg, preset: p, timer: T.start(T.createTimer(cfg), now) });
}

export function toggleTimer() {
  unlockAudio();
  const s = get();
  if (s.timer.status === "idle" && !s.session) return startPomodoro();
  if (s.stage === "starter_check" || s.stage === "review" || s.stage === "phone") return;
  set({ timer: T.toggle(s.timer, Date.now()) });
}

export function restartTimer() {
  const s = get();
  if (s.stage === "review" || s.stage === "phone") return;
  const now = Date.now();
  if (s.timer.phaseStartedAt) {
    const elapsed = T.elapsedMs(s.timer, now);
    if (s.session) set({ session: { ...s.session, activeMsBefore: s.session.activeMsBefore + elapsed } });
  }
  set({ timer: T.restartPhase(get().timer, now, true) });
}

export function skipPhase() {
  const s = get();
  if (s.stage === "review" || s.stage === "phone" || s.stage === "starter_check") return;
  const now = Date.now();
  const { state, finished } = T.skip(s.timer, now, s.config);
  let session = s.session;
  if (finished) {
    logPhase(finished, session?.sessionId ?? null, session?.subjectId ?? null);
    if (session) session = { ...session, activeMsBefore: session.activeMsBefore + finished.actualMs };
  }
  set({ timer: state, session });
}

export function resetPomodoro() {
  const s = get();
  if (s.session) return;
  const now = Date.now();
  if (s.timer.phaseStartedAt) {
    const elapsed = Math.min(T.elapsedMs(s.timer, now), s.timer.phaseDurationMs);
    logPhase(
      { phase: s.timer.phase, startedAt: s.timer.phaseStartedAt, endedAt: now, plannedMs: s.timer.phaseDurationMs, actualMs: elapsed, completed: false },
      null,
      null,
    );
  }
  const cfg = configFor(db.settings(), s.preset);
  set({ timer: T.createTimer(cfg), config: cfg });
}

export function choosePreset(preset: PresetKey) {
  const s = get();
  const cfg = configFor(db.settings(), preset);
  if (s.timer.status === "idle") set({ preset, config: cfg, timer: T.createTimer(cfg) });
  else set({ preset, config: cfg, timer: T.reconfigure(s.timer, cfg) });
}

/** Keep an idle timer in sync with settings changes (settings must be real). */
export function syncConfigFromSettings(settings: Settings) {
  const s = get();
  const cfg = configFor(settings, s.preset);
  const same = JSON.stringify(cfg) === JSON.stringify(s.config);
  if (same) return;
  if (s.timer.status === "idle" && !s.session) set({ config: cfg, timer: T.createTimer(cfg) });
  else if (!s.session?.starter) set({ config: cfg, timer: T.reconfigure(s.timer, cfg) });
}

/* ------------------------------------------------------------------ */
/* Study sessions                                                       */
/* ------------------------------------------------------------------ */

export function beginSession(setup: SessionSetup) {
  unlockAudio();
  const s = get();
  if (s.session && s.stage !== "idle") {
    toast.warning("A session is already running", "Finish or discard it first.");
    return false;
  }
  if (setup.focusMode) {
    ui.setFocusMode(true);
    if (db.settings().pomodoro.fullscreen) void enterFullscreen();
  }
  if (setup.phoneAway) {
    set({ stage: "phone", pendingSetup: setup });
    return true;
  }
  launch(setup);
  return true;
}

export function confirmPhoneAway() {
  const setup = get().pendingSetup;
  if (!setup) return set({ stage: "idle" });
  launch(setup);
}

export function cancelPending() {
  set({ stage: "idle", pendingSetup: null });
  ui.setFocusMode(false);
}

function launch(setup: SessionSetup) {
  const now = Date.now();
  const settings = db.settings();
  const baseCfg = configFor(settings, setup.preset);
  const cfg = setup.starter ? starterConfig(baseCfg) : baseCfg;
  const block = db.get("scheduleBlocks", setup.blockId);
  let sessionId: string;
  try {
    const row = db.create("studySessions", {
      subjectId: setup.subjectId,
      lessonId: setup.lessonId,
      blockId: setup.blockId,
      activity: setup.activity,
      title: setup.title,
      status: "active",
      startedAt: new Date(now).toISOString(),
      plannedMinutes: setup.plannedMinutes ?? 0,
      starter: !!setup.starter,
      startDelayMinutes: block ? startDelayMinutes(block, new Date(now)) : null,
    });
    sessionId = row.id;
  } catch {
    set({ stage: "idle", pendingSetup: null });
    return;
  }
  if (block) db.update("scheduleBlocks", block.id, { status: "in_progress", sessionId });
  if (setup.lessonId) {
    const lesson = db.get("lessons", setup.lessonId);
    if (lesson && lesson.status === "not_started") {
      db.update("lessons", lesson.id, { status: "learning", startedAt: lesson.startedAt ?? new Date(now).toISOString() });
    }
  }
  set({
    stage: "running",
    pendingSetup: null,
    preset: setup.preset,
    config: cfg,
    timer: T.start(T.createTimer(cfg), now),
    session: {
      sessionId,
      subjectId: setup.subjectId,
      lessonId: setup.lessonId,
      blockId: setup.blockId,
      activity: setup.activity,
      title: setup.title,
      plannedMinutes: setup.starter ? STARTER_MINUTES : setup.plannedMinutes,
      preset: setup.preset,
      starter: !!setup.starter,
      startedAt: now,
      activeMsBefore: 0,
      interruptions: 0,
      phoneChecks: 0,
      starterContinued: null,
      endedAt: null,
    },
  });
}

export function logPhoneCheck() {
  const s = get().session;
  if (!s) return;
  set({ session: { ...s, phoneChecks: s.phoneChecks + 1, interruptions: s.interruptions + 1 } });
  db.update("studySessions", s.sessionId, { phoneChecks: s.phoneChecks + 1, interruptions: s.interruptions + 1 });
}

export function logInterruption() {
  const s = get().session;
  if (!s) return;
  set({ session: { ...s, interruptions: s.interruptions + 1 } });
  db.update("studySessions", s.sessionId, { interruptions: s.interruptions + 1 });
}

/** Starter: user chose to keep going — convert into a normal session. */
export function continueStarter() {
  const s = get();
  if (!s.session) return;
  const settings = db.settings();
  const preset = settingsPreset(settings);
  const cfg = configFor(settings, preset);
  const block = db.get("scheduleBlocks", s.session.blockId);
  const planned = block?.durationMinutes ?? settings.study.blockMinutes;
  const now = Date.now();
  const timer: T.TimerState = {
    ...T.createTimer(cfg),
    focusedMsBefore: s.timer.focusedMsBefore,
  };
  set({
    stage: "running",
    preset,
    config: cfg,
    timer: T.start(timer, now),
    session: { ...s.session, starter: false, starterContinued: true, plannedMinutes: planned + STARTER_MINUTES, preset },
  });
  db.update("studySessions", s.session.sessionId, { starterContinued: true, plannedMinutes: planned + STARTER_MINUTES });
  toast.success("Converted to a full session", "The first 5 minutes already count.");
}

export function stopStarter() {
  const s = get();
  if (!s.session) return;
  set({ session: { ...s.session, starterContinued: false } });
  finishSession(Date.now(), "user");
}

/** End the session: close the running phase and save measured values. */
export function finishSession(at = Date.now(), reason: "time" | "user" = "user") {
  const s = get();
  if (!s.session) return;
  const timer = s.timer;
  let session = s.session;
  let focusedMs = timer.focusedMsBefore;
  if (timer.phaseStartedAt && timer.status !== "idle") {
    const elapsed = Math.min(T.elapsedMs(timer, at), timer.phaseDurationMs);
    if (timer.phase === "focus") focusedMs += elapsed;
    if (elapsed > 0) {
      logPhase(
        { phase: timer.phase, startedAt: timer.phaseStartedAt, endedAt: at, plannedMs: timer.phaseDurationMs, actualMs: elapsed, completed: elapsed >= timer.phaseDurationMs },
        session.sessionId,
        session.subjectId,
      );
      session = { ...session, activeMsBefore: session.activeMsBefore + elapsed };
    }
  }
  const completedPomodoros = timer.completedFocus;
  session = { ...session, endedAt: at };
  const actualMinutes = Math.round(session.activeMsBefore / 60_000);
  const focusedMinutes = Math.min(actualMinutes, Math.round(focusedMs / 60_000));
  db.update("studySessions", session.sessionId, {
    status: "completed",
    endedAt: new Date(at).toISOString(),
    actualMinutes,
    focusedMinutes,
    pomodoros: completedPomodoros,
    starterContinued: session.starter ? session.starterContinued ?? false : session.starterContinued,
  });
  if (session.blockId) {
    db.update("scheduleBlocks", session.blockId, { status: "completed" });
    const block = db.get("scheduleBlocks", session.blockId);
    if (block?.backlogId) db.update("backlogItems", block.backlogId, { status: "done" });
  }
  set({ stage: "review", session, timer: { ...T.pause(timer, at), status: "idle" } });
  if (reason === "time") alert("Session complete", "Planned time reached. Log how it went.");
}

/** Leave the review screen and reset the timer. */
export function closeSession() {
  const settings = db.settings();
  const cfg = configFor(settings, settingsPreset(settings));
  set({ stage: "idle", session: null, pendingSetup: null, timer: T.createTimer(cfg), config: cfg, preset: settingsPreset(settings) });
  ui.setFocusMode(false);
}

/** Throw away the running session (kept as "abandoned", block reset). */
export function discardSession() {
  const s = get();
  if (s.session) {
    db.update("studySessions", s.session.sessionId, { status: "abandoned", endedAt: new Date().toISOString() });
    if (s.session.blockId) {
      const b = db.get("scheduleBlocks", s.session.blockId);
      if (b && b.status === "in_progress") db.update("scheduleBlocks", b.id, { status: "upcoming", sessionId: null });
    }
  }
  closeSession();
}

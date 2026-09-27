"use client";

import { useEffect } from "react";
import { combine, daysBetween, formatCountdown, timeToMinutes, todayKey } from "@/lib/domain/dates";
import { FOCUS_KINDS } from "@/lib/domain/scheduler";
import { remainingMs } from "@/lib/domain/timer";
import { notify } from "@/lib/focus/notify";
import { DEFAULT_SETTINGS, type NotificationCategoryKey } from "@/lib/schemas/settings";
import { regenerateWeeklyPlan, syncWeeklyPlan } from "@/lib/actions";

import { db, initDataStore, useDataStore, useRows, useSettings } from "@/lib/store/data";
import { syncConfigFromSettings, tick, useFocus } from "@/lib/store/focus";

/* ------------------------------------------------------------------ */
/* Bootstrapping + preferences                                          */
/* ------------------------------------------------------------------ */

export function Bootstrap() {
  const settings = useSettings();
  const status = useDataStore((s) => s.status);

  useEffect(() => {
    void useFocus.persist.rehydrate();
    void initDataStore();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const { theme, language } = settings.general;
  const { density, reducedMotion, animations } = settings.display;
  useEffect(() => {
    if (status !== "ready") return;
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    root.lang = language;
    root.dir = language === "ar" ? "rtl" : "ltr";
    root.dataset.density = density;
    if (reducedMotion || !animations) root.dataset.motion = "reduced";
    else delete root.dataset.motion;
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [status, theme, language, density, reducedMotion, animations]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Timer engine                                                         */
/* ------------------------------------------------------------------ */

const WAKE_WORKER = `let t;onmessage=(e)=>{clearTimeout(t);if(e.data>=0)t=setTimeout(()=>postMessage("tick"),e.data)}`;

export function TimerEngine() {
  const status = useFocus((s) => s.timer.status);
  const pomodoro = useSettings().pomodoro;

  // Settings must be real: an idle timer picks up new durations immediately.
  useEffect(() => {
    syncConfigFromSettings(db.settings());
  }, [pomodoro]);

  useEffect(() => {
    if (status !== "running") {
      document.title = document.title.replace(/^[\d:]+ · /, "");
      return;
    }
    const baseTitle = document.title.replace(/^[\d:]+ · /, "");
    const updateTitle = () => {
      const s = useFocus.getState();
      const show = db.settings().pomodoro.showRemaining;
      const clean = document.title.replace(/^[\d:]+ · /, "") || baseTitle;
      document.title = show && s.timer.status === "running" ? `${formatCountdown(remainingMs(s.timer, Date.now()))} · ${clean}` : clean;
    };
    // Background tabs throttle intervals; a worker timeout wakes us at the exact phase end.
    let worker: Worker | null = null;
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([WAKE_WORKER], { type: "text/javascript" }));
      worker = new Worker(url);
    } catch {
      worker = null;
    }
    const scheduleWake = () => {
      const s = useFocus.getState();
      if (worker && s.timer.status === "running") worker.postMessage(remainingMs(s.timer, Date.now()) + 30);
    };
    const run = () => {
      tick();
      updateTitle();
    };
    if (worker) {
      worker.onmessage = () => {
        run();
        scheduleWake();
      };
    }
    run();
    scheduleWake();
    const interval = setInterval(run, 500);
    const unsub = useFocus.subscribe((s, prev) => {
      if (s.timer.phase !== prev.timer.phase || s.timer.segmentStartedAt !== prev.timer.segmentStartedAt) scheduleWake();
    });
    const onVisible = () => run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      document.title = document.title.replace(/^[\d:]+ · /, "");
    };
  }, [status]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Reminders                                                            */
/* ------------------------------------------------------------------ */

const FIRED_KEY = "sos-notified";

function readFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function markFired(key: string) {
  const fired = readFired();
  fired[key] = Date.now();
  const weekAgo = Date.now() - 7 * 86_400_000;
  for (const k of Object.keys(fired)) if (fired[k] < weekAgo) delete fired[k];
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
  } catch {
    /* ignore */
  }
}

/**
 * In-app reminders: study block starting, revisions due, upcoming exam. Each
 * fires at most once, only while the app is open in a tab (there is no push
 * server), and each can be turned off in Settings → Notifications.
 */
export function NotificationEngine() {
  const status = useDataStore((s) => s.status);
  useEffect(() => {
    if (status !== "ready") return;
    const check = () => {
      const settings = db.settings();
      const cats = settings.notifications.categories;
      const now = new Date();
      const today = todayKey(now);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const fired = readFired();
      const cfg = (k: NotificationCategoryKey) => {
        const c = cats[k];
        return c.mode === "custom" ? c : { ...DEFAULT_SETTINGS.notifications.categories[k], mode: c.mode };
      };
      const send = (key: string, title: string, body: string) => {
        if (fired[key]) return;
        markFired(key);
        void notify(title, body, { browser: settings.notifications.browser, tag: key });
      };
      const due = (time: string) => nowMin >= timeToMinutes(time) && nowMin < timeToMinutes(time) + 90;

      const study = cfg("studyReminder");
      if (study.mode !== "off") {
        for (const b of db.list("scheduleBlocks")) {
          if (b.date !== today || b.status !== "upcoming" || !FOCUS_KINDS.has(b.kind)) continue;
          const start = combine(b.date, b.start).getTime();
          if (now.getTime() >= start - study.leadMinutes * 60_000 && now.getTime() < start + 5 * 60_000) {
            send(`study:${b.id}`, "Study block starting", `${b.title || "Study"} at ${b.start}`);
          }
        }
      }

      const rev = cfg("revisionDue");
      if (rev.mode !== "off" && due(rev.time)) {
        const count = db.list("revisions").filter((r) => r.status === "pending" && r.scheduledDate <= today).length;
        if (count > 0) send(`rev:${today}`, "Revision due", `${count} revision${count === 1 ? "" : "s"} due today.`);
      }

      const exam = cfg("examReminder");
      if (exam.mode !== "off" && due(exam.time)) {
        const leadDays = Math.max(0, Math.round(exam.leadMinutes / 1440));
        for (const e of db.list("exams")) {
          if (e.status === "completed") continue;
          const d = daysBetween(today, e.date);
          if (d >= 0 && d <= leadDays) send(`exam:${e.id}:${today}`, "Upcoming exam", `${e.name} — ${d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}.`);
        }
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [status]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Weekly routine                                                       */
/* ------------------------------------------------------------------ */

/**
 * Keeps the calendar filled in. The first time it builds the weekly routine from the
 * subjects' priorities and weekly targets. After that it stores the next two weeks
 * from the routine whenever the day, the routine, the study window, the subjects or
 * lesson progress change. Blocks you started, completed, skipped, edited or moved are
 * never replaced (see syncWeeklyPlan).
 */
export function AutoPlanner() {
  const status = useDataStore((s) => s.status);
  const source = useDataStore((s) => s.source);
  const settings = useSettings();
  const subjects = useRows("subjects");
  const lessons = useRows("lessons");
  const configured = settings.weeklyPlan.configured;
  const today = todayKey();
  const signature = JSON.stringify([
    today,
    settings.weeklyPlan,
    settings.study.daysOff,
    settings.study.windowStart,
    settings.study.breakMinutes,
    settings.study.meals,
    subjects.map((x) => [x.id, x.enabled, x.archived]),
    lessons.map((l) => l.status[0]).join(""),
  ]);
  const ready = status === "ready" && source === "server" && settings.onboardingCompleted;

  useEffect(() => {
    if (!ready || subjects.length === 0) return;
    if (!configured) {
      regenerateWeeklyPlan();
      return;
    }
    syncWeeklyPlan();
  }, [ready, configured, signature, subjects.length]);

  return null;
}

"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { activeSubjects, buildCurriculumIndex } from "./domain/curriculum";
import { format } from "date-fns";
import { dateFromKey, toDateKey } from "./domain/dates";
import { occurrencesBetween } from "./domain/weekly";
import type { Subject } from "./schemas/entities";
import { useDataStore, useRows } from "./store/data";

/* ------------------------------------------------------------------ */
/* Clock                                                                */
/* ------------------------------------------------------------------ */

const clockListeners = new Map<number, Set<() => void>>();
const clockTeardown = new Map<number, () => void>();
const clockValues = new Map<number, number>();

function subscribeClock(interval: number, cb: () => void) {
  let set = clockListeners.get(interval);
  if (!set) {
    set = new Set();
    clockListeners.set(interval, set);
    // Refresh only a stale value; React re-reads the snapshot once after subscribing.
    if (Date.now() - (clockValues.get(interval) ?? 0) >= interval) clockValues.set(interval, Date.now());
    const fire = () => {
      clockValues.set(interval, Date.now());
      clockListeners.get(interval)?.forEach((l) => l());
    };
    const timer = setInterval(fire, interval);
    document.addEventListener("visibilitychange", fire);
    clockTeardown.set(interval, () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", fire);
    });
  }
  const listeners = set;
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      clockTeardown.get(interval)?.();
      clockTeardown.delete(interval);
      clockListeners.delete(interval);
    }
  };
}

function readClock(interval: number) {
  let v = clockValues.get(interval);
  if (v === undefined) {
    v = Date.now();
    clockValues.set(interval, v);
  }
  return v;
}

/** One stable subscribe function per interval (an inline one would resubscribe every render). */
const subscribeFns = new Map<number, (cb: () => void) => () => void>();
function subscriberFor(interval: number) {
  let fn = subscribeFns.get(interval);
  if (!fn) {
    fn = (cb) => subscribeClock(interval, cb);
    subscribeFns.set(interval, fn);
  }
  return fn;
}

/**
 * Current time (epoch ms) that re-renders every `interval` ms. Shared timers
 * per interval keep this cheap even with many subscribers.
 */
export function useNow(interval = 30_000): number {
  return useSyncExternalStore(
    subscriberFor(interval),
    () => readClock(interval),
    () => 0,
  );
}

export function useToday(): string {
  const now = useNow(60_000);
  return toDateKey(new Date(now));
}

const noopSubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

export function useMounted() {
  return useSyncExternalStore(noopSubscribe, getTrue, getFalse);
}

/* ------------------------------------------------------------------ */
/* Data helpers                                                         */
/* ------------------------------------------------------------------ */

export function useSubjects() {
  const rows = useRows("subjects");
  return useMemo(() => {
    const all = [...rows].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return { all, active: activeSubjects(rows), byId: new Map<string, Subject>(rows.map((s) => [s.id, s])) };
  }, [rows]);
}

export function useCurriculum() {
  const units = useRows("units");
  const chapters = useRows("chapters");
  const lessons = useRows("lessons");
  return useMemo(() => {
    const idx = buildCurriculumIndex(units, chapters, lessons);
    return { ...idx, units, chapters, lessons, lessonById: new Map(lessons.map((l) => [l.id, l])) };
  }, [units, chapters, lessons]);
}

/** Debounced callback for autosave. Always calls the latest function. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay = 600) {
  const fnRef = useRef(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return useMemo(
    () =>
      (...args: A) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => fnRef.current(...args), delay);
      },
    [delay],
  );
}

/** Local draft state that re-syncs when the external value changes. */
export function useDraft<T>(value: T): [T, (v: T) => void] {
  const [state, setState] = useState<{ source: T; draft: T }>({ source: value, draft: value });
  if (state.source !== value) {
    const next = { source: value, draft: value };
    setState(next);
    return [value, (v: T) => setState({ source: value, draft: v })];
  }
  return [state.draft, (v: T) => setState({ source: state.source, draft: v })];
}

/** Formats a YYYY-MM-DD key with the user's chosen date format (Settings → General). */
export function useFmtDate() {
  const pattern = useDataStore((s) => s.settings.general.dateFormat);
  return useMemo(() => (key: string | null | undefined) => (key ? format(dateFromKey(key), pattern) : "—"), [pattern]);
}

/**
 * The blocks of `days` days starting at `from`: stored blocks plus what the weekly
 * routine will put there (marked `virtual`). Maps date → blocks sorted by start.
 */
export function useOccurrences(from: string, days: number) {
  const blocks = useRows("scheduleBlocks");
  const { byId } = useSubjects();
  const settings = useDataStore((s) => s.settings);
  const today = useToday();
  return useMemo(() => {
    const map = occurrencesBetween(settings, from, days, byId, blocks);
    // Days that are over show what actually happened, not what the routine would have put there.
    for (const [date, list] of map) if (date < today) map.set(date, list.filter((b) => !b.virtual));
    return map;
  }, [settings, from, days, byId, blocks, today]);
}

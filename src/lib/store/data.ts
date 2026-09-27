"use client";

import { useMemo } from "react";
import { create } from "zustand";
import {
  ENTITY_NAMES,
  type EntityFields,
  type EntityName,
  type Row,
  validateCreate,
  validateUpdate,
} from "../schemas/entities";
import { DEFAULT_SETTINGS, deepMerge, parseSettings, settingsSchema, type Settings } from "../schemas/settings";
import { uid } from "../utils";
import { idbGet, idbSet } from "./idb";
import { toast } from "./toast";

/**
 * Local-first data store.
 *
 * - All user data for the single local user is loaded once (`/api/bootstrap`)
 *   and kept in memory, so every page renders instantly and domain logic runs
 *   client-side as pure functions.
 * - Mutations apply optimistically, then go into a persistent queue that is
 *   flushed to `/api/sync` in order. While offline the queue is kept in
 *   IndexedDB and retried with backoff; nothing is silently dropped.
 * - A snapshot is cached in IndexedDB so the app (timer, today's plan) opens
 *   offline.
 * - Server-side validation failures are surfaced as toasts and the store
 *   reloads from the server so the UI never shows data that wasn't saved.
 */

export type Tables = { [E in EntityName]: Record<string, Row<E>> };

export type OpType = "create" | "update" | "delete" | "restore";
export interface QueuedOp {
  opId: string;
  entity: EntityName | "settings";
  type: OpType;
  id: string;
  data?: unknown;
}

export type SyncState = "idle" | "syncing" | "offline" | "error";

interface DataState {
  status: "loading" | "ready" | "error";
  source: "none" | "cache" | "server";
  loadError: string | null;
  tables: Tables;
  settings: Settings;
  queue: QueuedOp[];
  syncState: SyncState;
  lastSyncedAt: string | null;
}

const emptyTables = (): Tables => Object.fromEntries(ENTITY_NAMES.map((e) => [e, {}])) as unknown as Tables;

export const useDataStore = create<DataState>(() => ({
  status: "loading",
  source: "none",
  loadError: null,
  tables: emptyTables(),
  settings: DEFAULT_SETTINGS,
  queue: [],
  syncState: "idle",
  lastSyncedAt: null,
}));

const set = useDataStore.setState;
const get = useDataStore.getState;

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

const SNAPSHOT_KEY = "snapshot-v1";
const QUEUE_KEY = "queue-v1";
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { tables, settings, queue } = get();
    void idbSet(SNAPSHOT_KEY, { tables, settings, savedAt: new Date().toISOString() });
    void idbSet(QUEUE_KEY, queue);
  }, 400);
}

function mirrorPrefs(settings: Settings) {
  // Mirrored to localStorage so the pre-paint script can apply theme/dir without a flash.
  try {
    localStorage.setItem(
      "sos-prefs",
      JSON.stringify({
        theme: settings.general.theme,
        lang: settings.general.language,
        density: settings.display.density,
        reducedMotion: settings.display.reducedMotion,
        animations: settings.display.animations,
      }),
    );
  } catch {
    /* storage blocked */
  }
}

/* ------------------------------------------------------------------ */
/* Local op application                                                */
/* ------------------------------------------------------------------ */

function applyLocal(tables: Tables, settings: Settings, op: QueuedOp, now: string): { tables: Tables; settings: Settings } {
  if (op.entity === "settings") return { tables, settings: parseSettings(op.data) };
  const entity = op.entity;
  const table = { ...(tables[entity] as Record<string, Row<EntityName>>) };
  const existing = table[op.id];
  if (op.type === "create") {
    table[op.id] = { ...(op.data as object), id: op.id, createdAt: existing?.createdAt ?? now, updatedAt: now, deletedAt: null } as Row<EntityName>;
  } else if (op.type === "update") {
    if (!existing) return { tables, settings };
    table[op.id] = { ...existing, ...(op.data as object), updatedAt: now };
  } else if (op.type === "delete") {
    delete table[op.id];
  } else if (op.type === "restore") {
    const data = op.data as Row<EntityName> | undefined;
    if (data) table[op.id] = { ...data, deletedAt: null, updatedAt: now };
  }
  return { tables: { ...tables, [entity]: table }, settings };
}

function enqueue(op: Omit<QueuedOp, "opId">) {
  const full: QueuedOp = { ...op, opId: uid() };
  const now = new Date().toISOString();
  const state = get();
  const next = applyLocal(state.tables, state.settings, full, now);
  let queue = [...state.queue];
  // Coalesce with a queued (not yet in-flight) op for the same row.
  const idx = queue.findLastIndex((q) => q.entity === full.entity && q.id === full.id && !inFlight.has(q.opId));
  const prev = idx >= 0 ? queue[idx] : null;
  if (prev && full.entity === "settings") {
    queue[idx] = { ...prev, data: full.data };
  } else if (prev && full.type === "update" && (prev.type === "create" || prev.type === "update")) {
    queue[idx] = { ...prev, data: { ...(prev.data as object), ...(full.data as object) } };
  } else if (prev && full.type === "delete" && prev.type === "create") {
    queue = queue.filter((_, i) => i !== idx); // created and deleted before sync: nothing to send
  } else {
    queue.push(full);
  }
  set({ tables: next.tables, settings: next.settings, queue });
  if (full.entity === "settings") mirrorPrefs(next.settings);
  schedulePersist();
  scheduleFlush();
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

const inFlight = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let retryDelay = 2000;

function scheduleFlush(delay = 250) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), delay);
}

interface SyncResponse {
  results: { opId: string; ok: boolean; error?: string; row?: Record<string, unknown> }[];
}

export async function flush(): Promise<void> {
  if (flushing) return;
  const batch = get().queue.slice(0, 100);
  if (batch.length === 0) {
    if (get().syncState !== "offline") set({ syncState: "idle" });
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    set({ syncState: "offline" });
    return;
  }
  flushing = true;
  batch.forEach((op) => inFlight.add(op.opId));
  set({ syncState: "syncing" });
  let reload = false;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops: batch }),
    });
    if (res.status >= 500) throw new Error(`Server error ${res.status}`);
    if (!res.ok) {
      // The whole batch was rejected as malformed: drop it and resync from the server.
      toast.error("Your data could not be saved.", "The server rejected the change. Your view was refreshed.");
      removeFromQueue(batch.map((b) => b.opId));
      reload = true;
    } else {
      const body = (await res.json()) as SyncResponse;
      const failed = body.results.filter((r) => !r.ok);
      removeFromQueue(body.results.map((r) => r.opId));
      for (const f of failed.slice(0, 3)) toast.error("Your data could not be saved.", f.error);
      if (failed.length) reload = true;
      set({ lastSyncedAt: new Date().toISOString(), syncState: "idle" });
      retryDelay = 2000;
    }
  } catch {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    set({ syncState: offline ? "offline" : "error" });
    scheduleFlush(retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60_000);
  } finally {
    batch.forEach((op) => inFlight.delete(op.opId));
    flushing = false;
  }
  if (reload) await refreshFromServer();
  if (get().queue.length > 0 && get().syncState === "idle") scheduleFlush(50);
}

function removeFromQueue(opIds: string[]) {
  const done = new Set(opIds);
  set({ queue: get().queue.filter((q) => !done.has(q.opId)) });
  schedulePersist();
}

function toTables(data: Record<string, unknown[]>): Tables {
  const tables = emptyTables() as unknown as Record<string, Record<string, unknown>>;
  for (const e of ENTITY_NAMES) {
    for (const row of (data[e] ?? []) as { id: string }[]) tables[e][row.id] = row;
  }
  return tables as unknown as Tables;
}

async function refreshFromServer(): Promise<boolean> {
  try {
    const res = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!res.ok) throw new Error(`Bootstrap failed (${res.status})`);
    const body = (await res.json()) as { settings: unknown; data: Record<string, unknown[]> };
    let tables = toTables(body.data);
    let settings = parseSettings(body.settings);
    // Re-apply changes that haven't reached the server yet.
    const now = new Date().toISOString();
    for (const op of get().queue) ({ tables, settings } = applyLocal(tables, settings, op, now));
    set({ tables, settings, status: "ready", source: "server", loadError: null });
    mirrorPrefs(settings);
    schedulePersist();
    return true;
  } catch (err) {
    if (get().status !== "ready") {
      set({
        status: "error",
        loadError: err instanceof Error ? err.message : "Could not load your data",
      });
    } else {
      set({ syncState: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error" });
    }
    return false;
  }
}

let initialized = false;

export async function initDataStore() {
  if (initialized) return;
  initialized = true;
  const [snapshot, queue] = await Promise.all([
    idbGet<{ tables: Tables; settings: unknown }>(SNAPSHOT_KEY),
    idbGet<QueuedOp[]>(QUEUE_KEY),
  ]);
  if (snapshot?.tables) {
    set({
      tables: { ...emptyTables(), ...snapshot.tables },
      settings: parseSettings(snapshot.settings),
      queue: queue ?? [],
      status: "ready",
      source: "cache",
    });
  } else if (queue?.length) {
    set({ queue });
  }
  await refreshFromServer();
  void flush();
  window.addEventListener("online", () => {
    retryDelay = 2000;
    set({ syncState: "idle" });
    void flush();
    void refreshFromServer();
  });
  window.addEventListener("offline", () => set({ syncState: "offline" }));
}

export async function retryLoad() {
  set({ status: "loading", loadError: null });
  await refreshFromServer();
  void flush();
}

/* ------------------------------------------------------------------ */
/* Public mutation API                                                 */
/* ------------------------------------------------------------------ */

export class ValidationError extends Error {}

function describe(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const i = error.issues[0];
  return i ? `${i.path.map(String).join(".") || "value"}: ${i.message}` : "Invalid data";
}

export const db = {
  /** Create a row. Throws ValidationError (and shows a toast) when invalid. */
  create<E extends EntityName>(entity: E, data: Partial<EntityFields<E>> & Record<string, unknown>, id: string = uid()): Row<E> {
    const parsed = validateCreate(entity, data);
    if (!parsed.success) {
      const msg = describe(parsed.error);
      toast.error("Please check the form", msg);
      throw new ValidationError(msg);
    }
    enqueue({ entity, type: "create", id, data: parsed.data });
    return get().tables[entity][id] as Row<E>;
  },

  update<E extends EntityName>(entity: E, id: string, patch: Partial<EntityFields<E>>): void {
    const parsed = validateUpdate(entity, patch);
    if (!parsed.success) {
      const msg = describe(parsed.error);
      toast.error("Please check the form", msg);
      throw new ValidationError(msg);
    }
    if (!get().tables[entity][id]) return;
    enqueue({ entity, type: "update", id, data: parsed.data });
  },

  /** Soft delete with an Undo toast. */
  remove<E extends EntityName>(entity: E, id: string, opts: { label?: string; silent?: boolean } = {}): void {
    const row = get().tables[entity][id];
    if (!row) return;
    enqueue({ entity, type: "delete", id });
    if (!opts.silent) {
      toast.withAction(`${opts.label ?? "Item"} deleted`, { label: "Undo", onClick: () => db.restore(entity, row) });
    }
  },

  restore<E extends EntityName>(entity: E, row: Row<E>): void {
    enqueue({ entity, type: "restore", id: row.id, data: row });
  },

  get<E extends EntityName>(entity: E, id: string | null | undefined): Row<E> | undefined {
    return id ? (get().tables[entity][id] as Row<E> | undefined) : undefined;
  },

  list<E extends EntityName>(entity: E): Row<E>[] {
    return Object.values(get().tables[entity]) as Row<E>[];
  },

  settings(): Settings {
    return get().settings;
  },

  /** Deep-merge a partial settings patch; validated before it is applied. */
  updateSettings(patch: DeepPartial<Settings>): boolean {
    const next = deepMerge(get().settings, patch);
    const parsed = settingsSchema.safeParse(next);
    if (!parsed.success) {
      toast.error("Setting not saved", describe(parsed.error));
      return false;
    }
    enqueue({ entity: "settings", type: "update", id: "settings", data: parsed.data });
    return true;
  },

  replaceSettings(settings: Settings) {
    enqueue({ entity: "settings", type: "update", id: "settings", data: settings });
  },

  refresh: refreshFromServer,
};

export type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** All live rows of an entity (stable reference until the table changes). */
export function useRows<E extends EntityName>(entity: E): Row<E>[] {
  const table = useDataStore((s) => s.tables[entity]);
  return useMemo(() => Object.values(table) as Row<E>[], [table]);
}

export function useRow<E extends EntityName>(entity: E, id: string | null | undefined): Row<E> | undefined {
  return useDataStore((s) => (id ? (s.tables[entity][id] as Row<E> | undefined) : undefined));
}

export function useSettings(): Settings {
  return useDataStore((s) => s.settings);
}

export function useIsDemoLoaded() {
  return useDataStore((s) => s.settings.demo.loaded);
}

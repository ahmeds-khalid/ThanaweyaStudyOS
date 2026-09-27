import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  ENTITY_NAMES,
  type EntityName,
  validateCreate,
  validateUpdate,
} from "@/lib/schemas/entities";
import { DEPENDENCY_ORDER, type BackupData } from "@/lib/schemas/backup";
import { DEFAULT_SETTINGS, parseSettings, settingsSchema, type Settings } from "@/lib/schemas/settings";
import { prisma } from "./db";

type Client = PrismaClient | Prisma.TransactionClient;

/** Minimal structural type shared by all model delegates we use generically. */
interface Delegate {
  findMany(args: object): Promise<Record<string, unknown>[]>;
  findFirst(args: object): Promise<Record<string, unknown> | null>;
  upsert(args: object): Promise<Record<string, unknown>>;
  updateMany(args: object): Promise<{ count: number }>;
  deleteMany(args: object): Promise<{ count: number }>;
}

const DELEGATES: Record<EntityName, (c: Client) => unknown> = {
  subjects: (c) => c.subject,
  units: (c) => c.curriculumUnit,
  chapters: (c) => c.chapter,
  lessons: (c) => c.lesson,
  studySessions: (c) => c.studySession,
  scheduleBlocks: (c) => c.scheduleBlock,
  backlogItems: (c) => c.backlogItem,
  tasks: (c) => c.task,
  revisions: (c) => c.revision,
  mistakes: (c) => c.mistake,
  questionSets: (c) => c.questionSet,
  exams: (c) => c.exam,
  goals: (c) => c.goal,
  calendarEvents: (c) => c.calendarEvent,
  pomodoroSessions: (c) => c.pomodoroSession,
  thoughts: (c) => c.thought,
  sleepEntries: (c) => c.sleepEntry,
  dailyReviews: (c) => c.dailyReview,
  weeklyReviews: (c) => c.weeklyReview,
  roadmapPhases: (c) => c.roadmapPhase,
};

const delegate = (entity: EntityName, c: Client = prisma) => DELEGATES[entity](c) as Delegate;

/* ------------------------------------------------------------------ */

export async function getSettings(userId: string, c: Client = prisma): Promise<Settings> {
  const row = await c.settings.findUnique({ where: { userId } });
  return row ? parseSettings(row.data) : DEFAULT_SETTINGS;
}

export async function saveSettings(userId: string, settings: Settings, c: Client = prisma) {
  const data = settings as unknown as Prisma.InputJsonValue;
  await c.settings.upsert({ where: { userId }, update: { data }, create: { userId, data } });
}

export async function loadAll(userId: string, includeDeleted = false): Promise<BackupData> {
  const where = includeDeleted ? { userId } : { userId, deletedAt: null };
  const results = await Promise.all(
    ENTITY_NAMES.map((e) => delegate(e).findMany({ where, orderBy: { createdAt: "asc" } })),
  );
  const out = {} as Record<string, unknown[]>;
  ENTITY_NAMES.forEach((e, i) => {
    out[e] = results[i].map(stripUser);
  });
  return out as unknown as BackupData;
}

function stripUser(row: Record<string, unknown>) {
  const { userId: _userId, ...rest } = row;
  void _userId;
  return rest;
}

/* ------------------------------------------------------------------ */
/* Sync operations                                                     */
/* ------------------------------------------------------------------ */

export const syncOpSchema = z.object({
  opId: z.string().min(1).max(64),
  entity: z.union([z.enum(ENTITY_NAMES as [EntityName, ...EntityName[]]), z.literal("settings")]),
  type: z.enum(["create", "update", "delete", "restore"]),
  id: z.string().min(1).max(64),
  data: z.unknown().optional(),
});
export type SyncOp = z.infer<typeof syncOpSchema>;

export interface SyncResult {
  opId: string;
  ok: boolean;
  error?: string;
  row?: Record<string, unknown>;
}

function describeZodError(error: z.ZodError) {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "value"}: ${issue.message}` : "Invalid data";
}

export async function applyOp(userId: string, op: SyncOp): Promise<SyncResult> {
  const { opId } = op;
  try {
    if (op.entity === "settings") {
      const parsed = settingsSchema.safeParse(op.data);
      if (!parsed.success) return { opId, ok: false, error: `Settings ${describeZodError(parsed.error)}` };
      await saveSettings(userId, parsed.data);
      return { opId, ok: true };
    }

    const entity = op.entity;
    const d = delegate(entity);

    if (op.type === "create") {
      const parsed = validateCreate(entity, op.data);
      if (!parsed.success) return { opId, ok: false, error: describeZodError(parsed.error) };
      const existing = await d.findFirst({ where: { id: op.id }, select: { userId: true } });
      if (existing && existing.userId !== userId) return { opId, ok: false, error: "Not allowed" };
      const data = parsed.data as Record<string, unknown>;
      // Upsert makes retries of the same queued create idempotent.
      const row = await d.upsert({
        where: { id: op.id },
        create: { ...data, id: op.id, userId },
        update: data,
      });
      return { opId, ok: true, row: stripUser(row) };
    }

    if (op.type === "update") {
      const parsed = validateUpdate(entity, op.data);
      if (!parsed.success) return { opId, ok: false, error: describeZodError(parsed.error) };
      const { count } = await d.updateMany({ where: { id: op.id, userId }, data: parsed.data });
      if (count === 0) return { opId, ok: false, error: "Item not found" };
      const row = await d.findFirst({ where: { id: op.id, userId } });
      return { opId, ok: true, row: row ? stripUser(row) : undefined };
    }

    const deletedAt = op.type === "delete" ? new Date() : null;
    const { count } = await d.updateMany({ where: { id: op.id, userId }, data: { deletedAt } });
    if (count === 0 && op.type === "restore") {
      // The row was created and deleted before it ever synced: create it now.
      const parsed = validateCreate(entity, op.data);
      if (!parsed.success) return { opId, ok: false, error: "Item not found" };
      await d.upsert({ where: { id: op.id }, create: { ...(parsed.data as object), id: op.id, userId }, update: { deletedAt: null } });
    }
    return { opId, ok: true };
  } catch (err) {
    console.error("[sync] op failed", op.entity, op.type, err);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Foreign key constraint")) {
      return { opId, ok: false, error: "A linked item (subject, lesson, …) no longer exists." };
    }
    return { opId, ok: false, error: "Database error" };
  }
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export async function importBackup(
  userId: string,
  data: BackupData,
  settings: Settings | null,
  mode: "merge" | "replace",
) {
  return prisma.$transaction(
    async (tx) => {
      if (mode === "replace") {
        for (const e of [...DEPENDENCY_ORDER].reverse()) {
          await delegate(e, tx).deleteMany({ where: { userId } });
        }
      }
      let written = 0;
      for (const e of DEPENDENCY_ORDER) {
        const d = delegate(e, tx);
        for (const row of data[e] ?? []) {
          const { id, createdAt, updatedAt, deletedAt, ...fields } = row as unknown as Record<string, unknown>;
          const existing = mode === "merge" ? await d.findFirst({ where: { id }, select: { userId: true } }) : null;
          if (existing && existing.userId !== userId) continue;
          const common = { ...fields, deletedAt: deletedAt ?? null };
          await d.upsert({
            where: { id },
            create: { ...common, id, userId, createdAt, updatedAt },
            update: common,
          });
          written++;
        }
      }
      if (settings) await saveSettings(userId, settings, tx);
      return { written };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

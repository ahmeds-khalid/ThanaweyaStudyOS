import { z } from "zod";
import { ENTITY_NAMES, type EntityName, type Row, validateCreate } from "./entities";
import { parseSettings, type Settings } from "./settings";

export const BACKUP_APP_ID = "thanaweya-study-os";
export const BACKUP_VERSION = 1;

/** Order that respects foreign keys (parents before children). */
export const DEPENDENCY_ORDER: EntityName[] = [
  "subjects",
  "units",
  "chapters",
  "lessons",
  "mistakes",
  "revisions",
  "studySessions",
  "scheduleBlocks",
  "backlogItems",
  "tasks",
  "questionSets",
  "exams",
  "goals",
  "calendarEvents",
  "pomodoroSessions",
  "thoughts",
  "sleepEntries",
  "dailyReviews",
  "weeklyReviews",
  "roadmapPhases",
];

export type BackupData = { [E in EntityName]: Row<E>[] };

export interface Backup {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  settings: Settings;
  data: BackupData;
}

const envelope = z.object({
  app: z.literal(BACKUP_APP_ID),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  settings: z.unknown(),
  data: z.record(z.string(), z.array(z.unknown())),
});

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  backup: Backup | null;
  counts: Partial<Record<EntityName, number>>;
}

const baseRow = z.object({
  id: z.string().min(1).max(64),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  deletedAt: z.string().nullable().optional(),
});

/** Validates an exported backup file. Never throws. */
export function validateBackup(input: unknown): BackupValidation {
  const errors: string[] = [];
  const env = envelope.safeParse(input);
  if (!env.success) {
    return {
      ok: false,
      errors: ["This file is not a Study OS backup (missing app/version/data fields)."],
      backup: null,
      counts: {},
    };
  }
  const data = {} as BackupData;
  const counts: Partial<Record<EntityName, number>> = {};
  for (const name of ENTITY_NAMES) {
    const rows = env.data.data[name] ?? [];
    const out: Row<EntityName>[] = [];
    rows.forEach((raw, i) => {
      const base = baseRow.safeParse(raw);
      if (!base.success) {
        errors.push(`${name}[${i}]: missing or invalid id`);
        return;
      }
      const fields = validateCreate(name, raw);
      if (!fields.success) {
        const issue = fields.error.issues[0];
        errors.push(`${name}[${i}] (${base.data.id}): ${issue?.path.join(".")} — ${issue?.message}`);
        return;
      }
      const now = new Date().toISOString();
      out.push({
        ...(fields.data as object),
        id: base.data.id,
        createdAt: base.data.createdAt ?? now,
        updatedAt: base.data.updatedAt ?? now,
        deletedAt: base.data.deletedAt ?? null,
      } as Row<EntityName>);
    });
    (data as Record<string, unknown>)[name] = out;
    counts[name] = out.length;
  }
  if (errors.length > 20) errors.splice(20, errors.length - 20, `…and more errors`);
  return {
    ok: errors.length === 0,
    errors,
    counts,
    backup: {
      app: BACKUP_APP_ID,
      version: env.data.version,
      exportedAt: env.data.exportedAt,
      settings: parseSettings(env.data.settings),
      data,
    },
  };
}

export function makeBackup(settings: Settings, data: BackupData): Backup {
  return { app: BACKUP_APP_ID, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings, data };
}

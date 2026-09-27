import {
  ENTITY_DEFAULTS,
  type EntityFields,
  type EntityName,
  type Row,
} from "../schemas/entities";
import { DEFAULT_SETTINGS, deepMerge, type Settings } from "../schemas/settings";

let counter = 0;

/** Build a complete row for tests with defaults + overrides. */
export function row<E extends EntityName>(entity: E, fields: Partial<EntityFields<E>> & Record<string, unknown>): Row<E> {
  counter++;
  const ts = new Date(2026, 8, 1, 12, 0, counter % 60).toISOString();
  return {
    ...(ENTITY_DEFAULTS[entity] as object),
    ...fields,
    id: (fields.id as string) ?? `${entity}-${counter}`,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  } as Row<E>;
}

export function settings(patch: Record<string, unknown> = {}): Settings {
  return deepMerge(DEFAULT_SETTINGS, patch);
}

export function subject(name: string, patch: Partial<EntityFields<"subjects">> = {}) {
  return row("subjects", { id: `sub-${name.toLowerCase()}`, name, ...patch });
}

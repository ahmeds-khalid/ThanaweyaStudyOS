import { z } from "zod";

/** Calendar day in local time, e.g. "2026-10-03". */
export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((v) => {
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "Invalid date");
/** Wall-clock time in local time, e.g. "09:30". */
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
/** ISO-8601 timestamp with offset/Z. */
export const isoDateTime = z.iso.datetime({ offset: true });

export const text = (max = 5000) => z.string().max(max);
export const rating = z.number().int().min(1).max(5);
export const nonNegInt = z.number().int().min(0);
export const nonNeg = z.number().min(0);
export const idRef = z.string().min(1).max(64);
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected #RRGGBB");

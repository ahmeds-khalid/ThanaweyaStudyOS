import { describe, expect, it } from "vitest";
import { row, settings as makeSettings } from "./fixtures.test-helpers";
import { dayLoadMinutes, findNextSlot } from "./scheduler";

// Saturday 3 Oct 2026, 07:00 local — before the study window opens.
const NOW = new Date(2026, 9, 3, 7, 0);
const START = "2026-10-03";

describe("findNextSlot", () => {
  const s = makeSettings();
  it("finds the next free slot after now that fits the daily limit", () => {
    const now = new Date(2026, 9, 3, 20, 30); // too late today for 90 minutes before 21:30
    const slot = findNextSlot({ settings: s, blocks: [], events: [], durationMinutes: 90, now });
    expect(slot).toEqual({ date: "2026-10-04", start: "10:00" });
  });

  it("skips days that are already full", () => {
    const now = new Date(2026, 9, 3, 7, 0);
    const full = [0, 1, 2, 3].map((i) =>
      row("scheduleBlocks", { date: START, start: ["10:00", "11:50", "15:50", "17:40"][i], durationMinutes: 105, kind: "study", source: "generated" }),
    );
    expect(dayLoadMinutes(full, START)).toBe(420);
    const slot = findNextSlot({ settings: s, blocks: full, events: [], durationMinutes: 60, now });
    expect(slot?.date).toBe("2026-10-04");
  });

  it("can target the catch-up day only", () => {
    const slot = findNextSlot({ settings: s, blocks: [], events: [], durationMinutes: 60, now: NOW, catchUpOnly: true });
    expect(slot?.date).toBe("2026-10-09");
  });
});

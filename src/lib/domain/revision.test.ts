import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../schemas/settings";
import { applyRatingEffect, dueBucket, firstReview, intervalForStep, ladderDates, nextReview } from "./revision";

const cfg = DEFAULT_SETTINGS.revision;

describe("revision engine", () => {
  it("uses the configured ladder", () => {
    expect([0, 1, 2, 3, 4].map((s) => intervalForStep(s, cfg))).toEqual([1, 3, 7, 14, 30]);
  });

  it("grows past the last rung by the growth factor, capped at a year", () => {
    expect(intervalForStep(5, cfg)).toBe(60);
    expect(intervalForStep(6, cfg)).toBe(120);
    expect(intervalForStep(20, cfg)).toBe(365);
  });

  it("applies each rating effect", () => {
    expect(applyRatingEffect(3, "reset")).toBe(0);
    expect(applyRatingEffect(3, "back")).toBe(2);
    expect(applyRatingEffect(0, "back")).toBe(0);
    expect(applyRatingEffect(3, "repeat")).toBe(3);
    expect(applyRatingEffect(3, "next")).toBe(4);
    expect(applyRatingEffect(3, "skip")).toBe(5);
  });

  it("suggests the next date from a rating (defaults)", () => {
    // Forgot → back to 1 day
    expect(nextReview("2026-10-01", 2, 1, cfg)).toEqual({ step: 0, intervalDays: 1, date: "2026-10-02" });
    // Weak → repeat same interval (7 days at step 2)
    expect(nextReview("2026-10-01", 2, 2, cfg)).toEqual({ step: 2, intervalDays: 7, date: "2026-10-08" });
    // Good → next rung (14 days)
    expect(nextReview("2026-10-01", 2, 4, cfg)).toEqual({ step: 3, intervalDays: 14, date: "2026-10-15" });
    // Excellent → skip a rung (30 days)
    expect(nextReview("2026-10-01", 2, 5, cfg)).toEqual({ step: 4, intervalDays: 30, date: "2026-10-31" });
  });

  it("respects custom configuration", () => {
    const custom = { ...cfg, intervals: [2, 5], ratingEffects: { ...cfg.ratingEffects, "3": "repeat" as const } };
    expect(nextReview("2026-10-01", 1, 3, custom).intervalDays).toBe(5);
    expect(firstReview("2026-12-30", 0, custom).date).toBe("2027-01-01");
  });

  it("builds the full ladder across month/year boundaries", () => {
    expect(ladderDates("2026-12-25", cfg).map((r) => r.date)).toEqual([
      "2026-12-26",
      "2026-12-28",
      "2027-01-01",
      "2027-01-08",
      "2027-01-24",
    ]);
  });

  it("buckets due dates", () => {
    expect(dueBucket("2026-10-01", "2026-10-02")).toBe("overdue");
    expect(dueBucket("2026-10-02", "2026-10-02")).toBe("today");
    expect(dueBucket("2026-10-03", "2026-10-02")).toBe("upcoming");
  });
});

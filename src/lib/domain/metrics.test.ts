import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../schemas/settings";
import {
  accuracy,
  avgTimePerQuestion,
  consistencyScore,
  examPercentage,
  formatMinutesPrecise,
  formatPercent,
  workloadLevel,
} from "./metrics";

describe("question metrics", () => {
  it("computes accuracy from attempted questions", () => {
    expect(accuracy(24, 30)).toBe(80);
    expect(formatPercent(accuracy(14, 18))).toBe("77.8%");
    expect(accuracy(0, 0)).toBeNull();
    // Correct can never exceed attempted.
    expect(accuracy(12, 10)).toBe(100);
  });

  it("computes average time per question = total time / attempted", () => {
    expect(avgTimePerQuestion(45, 30)).toBe(1.5);
    expect(formatMinutesPrecise(1.5)).toBe("1m 30s");
    expect(avgTimePerQuestion(null, 30)).toBeNull();
    expect(avgTimePerQuestion(10, 0)).toBeNull();
  });
});

describe("exam metrics", () => {
  it("computes percentage", () => {
    expect(examPercentage(42, 50)).toBe(84);
    expect(examPercentage(null, 50)).toBeNull();
    expect(examPercentage(10, 0)).toBeNull();
  });
});

describe("workload indicator", () => {
  const w = DEFAULT_SETTINGS.workload;
  it("uses configurable thresholds", () => {
    expect(workloadLevel(120, w)).toBe("light");
    expect(workloadLevel(180, w)).toBe("normal");
    expect(workloadLevel(360, w)).toBe("heavy");
    expect(workloadLevel(420, w)).toBe("overloaded");
    expect(workloadLevel(200, { lightBelow: 240, normalBelow: 360, heavyBelow: 480 })).toBe("light");
  });
});

describe("consistency score", () => {
  it("follows the documented formula", () => {
    expect(
      consistencyScore({ plannedBlocks: 10, completedBlocks: 8, focusedMinutes: 300, targetMinutes: 300, revisionsDue: 4, revisionsDone: 2 }),
    ).toBe(Math.round(50 * 0.8 + 30 * 1 + 20 * 0.5));
  });
  it("rescales when a component has no data", () => {
    expect(consistencyScore({ plannedBlocks: 0, completedBlocks: 0, focusedMinutes: 150, targetMinutes: 300, revisionsDue: 0, revisionsDone: 0 })).toBe(50);
    expect(consistencyScore({ plannedBlocks: 0, completedBlocks: 0, focusedMinutes: 0, targetMinutes: 0, revisionsDue: 0, revisionsDone: 0 })).toBeNull();
  });
});

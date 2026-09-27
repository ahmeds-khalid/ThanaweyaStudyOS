import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  awakeWindow,
  combine,
  daysBetween,
  formatClock,
  formatCountdown,
  formatMinutes,
  keysBetween,
  minutesToTime,
  sleepDurationMinutes,
  startOfWeekKey,
  timeToMinutes,
  weekdayOf,
} from "./dates";

describe("date keys (tests run in Africa/Cairo, which has DST)", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("is unaffected by the spring-forward gap (last Friday of April, 00:00 → 01:00)", () => {
    // 2027-04-30 is the last Friday of April 2027.
    expect(addDays("2027-04-29", 1)).toBe("2027-04-30");
    expect(addDays("2027-04-30", 1)).toBe("2027-05-01");
    expect(daysBetween("2027-04-25", "2027-05-05")).toBe(10);
    // Midnight does not exist that day; combine() resolves forward and stays on the right date.
    const d = combine("2027-04-30", "00:00");
    expect(d.getDate()).toBe(30);
  });

  it("is unaffected by the autumn fall-back (last Thursday of October)", () => {
    expect(daysBetween("2026-10-25", "2026-11-05")).toBe(11);
    expect(keysBetween("2026-10-28", "2026-11-01")).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });

  it("computes weekdays and week starts (Saturday-start weeks)", () => {
    expect(weekdayOf("2026-10-03")).toBe(6); // Saturday
    expect(startOfWeekKey("2026-10-07", 6)).toBe("2026-10-03");
    expect(startOfWeekKey("2026-10-03", 6)).toBe("2026-10-03");
    expect(startOfWeekKey("2026-10-07", 1)).toBe("2026-10-05");
  });

  it("adds months safely", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-01");
  });
});

describe("clock times", () => {
  it("converts and wraps", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(1500)).toBe("01:00");
    expect(minutesToTime(-30)).toBe("23:30");
  });

  it("handles a bedtime after midnight", () => {
    expect(awakeWindow("09:00", "00:00")).toEqual({ start: 540, end: 1440 });
    expect(awakeWindow("08:00", "00:30")).toEqual({ start: 480, end: 1470 });
    expect(awakeWindow("07:00", "23:00")).toEqual({ start: 420, end: 1380 });
    expect(sleepDurationMinutes("00:00", "09:00")).toBe(540);
    expect(sleepDurationMinutes("23:30", "08:30")).toBe(540);
  });

  it("formats", () => {
    expect(formatMinutes(250)).toBe("4h 10m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatClock("13:05", "12h")).toBe("1:05 PM");
    expect(formatClock("00:15", "12h")).toBe("12:15 AM");
    expect(formatCountdown(25 * 60_000)).toBe("25:00");
    expect(formatCountdown(1)).toBe("00:01");
    expect(formatCountdown(3_661_000)).toBe("1:01:01");
  });
});

import { describe, expect, it } from "vitest";
import { computeHeatmap, computeHistory, computeSummary, percentile } from "./stats";
import type { Session } from "./types";
import { DAY_MS, HOUR_MS, MIN_MS, boundsForDay, weekStart } from "./time";

const NOW = new Date(2026, 6, 10, 12, 0).getTime();
const TODAY = boundsForDay(NOW, 6);

const mkSession = (id: string, start: number, durMins: number | null): Session => ({
  id,
  start,
  end: durMins === null ? null : start + durMins * MIN_MS,
});

describe("percentile", () => {
  it("interpolates linearly", () => {
    expect(percentile([0, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });
  it("handles empty arrays", () => {
    expect(percentile([], 50)).toBe(0);
  });
});

describe("computeSummary", () => {
  it("counts completed sessions once at full duration (no per-day clipping for naps)", () => {
    // A night sleep crossing the day boundary: 22:00 yesterday to 07:00 today-ish
    const nightStart = TODAY.start - 8 * HOUR_MS; // 22:00 previous day
    const sessions = [mkSession("n", nightStart, 9 * 60)];
    const [napLength] = computeSummary(sessions, 6, TODAY.start);
    expect(napLength.values).toEqual([9 * HOUR_MS]);
  });

  it("computes wake windows within the same tracking day only", () => {
    const d = TODAY.start - DAY_MS; // yesterday 06:00
    const sessions = [
      mkSession("a", d + 2 * HOUR_MS, 60),
      mkSession("b", d + 5 * HOUR_MS, 60), // gap: 2h after a ends
    ];
    const summary = computeSummary(sessions, 6, TODAY.start);
    const wake = summary.find((s) => s.label === "Avg wake window")!;
    expect(wake.values).toEqual([2 * HOUR_MS]);
  });

  it("excludes days with zero sleep from daily totals", () => {
    const d = TODAY.start - 3 * DAY_MS;
    const sessions = [mkSession("a", d + 2 * HOUR_MS, 120)];
    const summary = computeSummary(sessions, 6, TODAY.start);
    const daily = summary.find((s) => s.label === "Avg daily sleep")!;
    expect(daily.values).toEqual([2 * HOUR_MS]);
  });
});

describe("computeHistory", () => {
  it("clips totals to the day but computes avgNap from sessions starting that day", () => {
    const yStart = TODAY.start - DAY_MS;
    // Night sleep starting yesterday 22:00 (16h into the tracking day), 9h long:
    // clipped contribution to yesterday = 8h (until 06:00), avgNap = full 9h.
    const sessions = [mkSession("n", yStart + 16 * HOUR_MS, 9 * 60)];
    const days = computeHistory(sessions, [], TODAY.start, NOW);
    expect(days).toHaveLength(1); // the 07:00 spill lands in today, which history excludes
    const yesterday = days.find((d) => d.bounds.start === yStart)!;
    expect(yesterday.totalSleep).toBe(8 * HOUR_MS);
    expect(yesterday.avgNap).toBe(9 * HOUR_MS);
    expect(yesterday.napCount).toBe(1);
  });

  it("skips empty days", () => {
    const days = computeHistory([], [], TODAY.start, NOW);
    expect(days).toEqual([]);
  });
});

describe("computeHeatmap", () => {
  it("marks slots untracked (null) when no day in the week has data", () => {
    const lastWeek = weekStart(NOW, 6) - 7 * DAY_MS;
    const sessions = [mkSession("a", lastWeek + 2 * HOUR_MS, 120)];
    const weeks = computeHeatmap(sessions, 60, weekStart(NOW, 6), NOW);
    expect(weeks).toHaveLength(1);
    const w = weeks[0];
    expect(w.weekStart).toBe(lastWeek);
    expect(w.sparse).toBe(true); // only 1 tracked day
    // slots 2 and 3 (08:00-10:00 local, day starts 06:00) asleep
    expect(w.cells[2]).toBe(1);
    expect(w.cells[3]).toBe(1);
    expect(w.cells[10]).toBe(0); // tracked day, awake
  });

  it("excludes the incomplete current day", () => {
    // only today has data -> today's week has zero complete tracked days -> no rows...
    // (week still listed because a session touches it, but all cells untracked)
    const sessions = [mkSession("a", TODAY.start + HOUR_MS, 60)];
    const weeks = computeHeatmap(sessions, 60, weekStart(NOW, 6), NOW);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].cells.every((c) => c === null)).toBe(true);
  });
});

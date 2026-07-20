import { describe, expect, it } from "vitest";
import { foldDiagnostics } from "./diagnostics";
import type { DayRecord } from "./types";

const day = (over: Partial<DayRecord>): DayRecord => ({
  dayKey: "2026-06-01",
  dayStart: 0,
  resolved: true,
  wellFormed: true,
  irregular: false,
  provisionalStart: false,
  naps: [],
  daySleepMin: 180,
  nightOnset: null,
  nightEnd: null,
  nightDurMin: 660,
  nightGaps: [],
  splitNight: false,
  earlyWakeNoResettle: false,
  totalSleepMin: 840,
  nightOnsetSettleMins: null,
  ...over,
});

describe("foldDiagnostics", () => {
  it("does nothing below the 3-of-7 trigger (brief wakings are explicitly ignored)", () => {
    const days = Array.from({ length: 14 }, () =>
      day({ nightGaps: [{ gapMin: 5, kind: "brief" }] }),
    );
    const s = foldDiagnostics(days);
    expect(s.budgetNudgeMin).toBe(0);
    expect(s.lateKnotNudgeMin).toBe(0);
    expect(s.capBias).toBe(false);
  });

  it("split nights ≥3 of 7 alternate budget −15 and late-knot +10, one change per week", () => {
    const days = Array.from({ length: 14 }, () => day({ splitNight: true }));
    const s = foldDiagnostics(days);
    // two evaluations: one budget step, one knot step (alternating)
    expect(s.budgetNudgeMin).toBe(-15);
    expect(s.lateKnotNudgeMin).toBe(10);
  });

  it("clamps nudges at ±45", () => {
    const days = Array.from({ length: 100 }, () => day({ splitNight: true }));
    const s = foldDiagnostics(days);
    expect(s.budgetNudgeMin).toBeGreaterThanOrEqual(-45);
    expect(s.lateKnotNudgeMin).toBeLessThanOrEqual(45);
  });

  it("decays nudges once the trigger clears", () => {
    const bad = Array.from({ length: 28 }, () => day({ splitNight: true }));
    const good = Array.from({ length: 28 }, () => day({}));
    const s = foldDiagnostics([...bad, ...good]);
    const sBad = foldDiagnostics(bad);
    expect(Math.abs(s.budgetNudgeMin)).toBeLessThan(Math.abs(sBad.budgetNudgeMin) + 1);
    expect(Math.abs(s.budgetNudgeMin)).toBeLessThanOrEqual(15);
  });

  it("early wakings ≥3 of 7 set the cap bias with a hint", () => {
    const days = Array.from({ length: 7 }, () => day({ earlyWakeNoResettle: true }));
    const s = foldDiagnostics(days);
    expect(s.capBias).toBe(true);
    expect(s.hints.length).toBeGreaterThan(0);
  });
});

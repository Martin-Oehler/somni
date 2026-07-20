import { describe, expect, it } from "vitest";
import { dayBudgetMinutes, expectedNightMinutes, foldBudget } from "./budget";
import { foldHistory } from "./history";
import { regularLog, at } from "./sim/kit";

const learningDays = (nDays: number, napDur = 60) =>
  foldHistory(
    regularLog(nDays, [
      [9, 0, napDur],
      [12, 30, napDur],
      [16, 0, napDur],
    ]),
    [],
    1170,
    at(nDays, 12, 0),
  ).filter((d) => d.resolved && d.wellFormed);

describe("foldBudget", () => {
  it("slews learned24h at most 10 min/day toward the clamped median", () => {
    // 26wk neutral prior: 825 min. Actual total: 3×60 + 660 = 840.
    const days = learningDays(5);
    const b = foldBudget(days, null, at(5, 12, 0));
    // ≤4 learning days × 10 min/day of movement from 825 toward 840
    expect(b.learned24hMin).toBeGreaterThan(825);
    expect(b.learned24hMin).toBeLessThanOrEqual(825 + days.length * 10);
  });

  it("clamps the target into the age-prior range", () => {
    // An implausible 16h-sleep baby: median clamps to prior.total + range.
    const days = learningDays(30, 120); // 3×120 + 660 = 1020 min
    const b = foldBudget(days, null, at(30, 12, 0));
    expect(b.learned24hMin).toBeLessThanOrEqual(825 + 90 + 1e-9);
  });

  it("reports night median and day-start median", () => {
    const b = foldBudget(learningDays(10), null, at(10, 12, 0));
    expect(b.nightMedianMin).toBeCloseTo(660, 5);
    expect(b.dayStartMedianClockMin).toBeCloseTo(390, 1);
  });
});

describe("expectedNightMinutes", () => {
  it("blends 50/50 with little data, 70/30 with ≥14 nights", () => {
    const base = { learned24hMin: 825, nightMedianMin: 600, dayStartMedianClockMin: 390, nightCount: 5 };
    // schedule night = 390 + 1440 − 1170 = 660
    expect(expectedNightMinutes(base, 1170, 645)).toBeCloseTo(0.5 * 600 + 0.5 * 660, 5);
    expect(expectedNightMinutes({ ...base, nightCount: 20 }, 1170, 645)).toBeCloseTo(
      0.7 * 600 + 0.3 * 660,
      5,
    );
  });

  it("falls back to the prior night without data", () => {
    const b = { learned24hMin: 825, nightMedianMin: null, dayStartMedianClockMin: null, nightCount: 0 };
    expect(expectedNightMinutes(b, 1170, 645)).toBeCloseTo(0.5 * 645 + 0.5 * (390 + 1440 - 1170), 5);
  });
});

describe("dayBudgetMinutes", () => {
  it("applies the damped single-night correction with a ±40 min clamp", () => {
    // expectedNight 660, last night only 540 → raw correction 36, within clamp
    expect(dayBudgetMinutes(840, 660, 540, 0)).toBeCloseTo(840 - 660 + 36, 5);
    // extreme short night: correction clamps at +40
    expect(dayBudgetMinutes(840, 660, 300, 0)).toBeCloseTo(840 - 660 + 40, 5);
    // long night: negative correction clamps at −40
    expect(dayBudgetMinutes(840, 660, 900, 0)).toBeCloseTo(840 - 660 - 40, 5);
  });

  it("includes the diagnostics nudge and never goes negative", () => {
    expect(dayBudgetMinutes(840, 660, null, -15)).toBeCloseTo(165, 5);
    expect(dayBudgetMinutes(600, 660, null, 0)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { buildDCurve, carryAt, dOf, priorNapMinutes, wEffAt } from "./pressure";
import { foldHistory } from "./history";
import { priorForAgeWeeks } from "./priors";
import { regularLog, at } from "./sim/kit";

const HOUR = 3_600_000;

describe("dCurve", () => {
  it("takes the median nap duration per 2h bucket with ≥4 observations", () => {
    const days = foldHistory(regularLog(10), [], 1170, at(10, 12, 0)).filter(
      (d) => d.resolved && d.wellFormed,
    );
    const dCurve = buildDCurve(days);
    expect(dCurve[4]).toBe(60); // 08:00–10:00 bucket ← 09:00 naps
    expect(dCurve[6]).toBe(70); // 12:00–14:00 ← 12:30 naps
    expect(dCurve[0]).toBeNull(); // no naps at night
  });

  it("falls back to the age-prior nap length when a bucket is sparse", () => {
    const prior = priorForAgeWeeks(26);
    const p = priorNapMinutes(prior);
    expect(dOf([null, null, null, null, null, null, null, null, null, null, null, null], p, 9 * 60)).toBe(p);
    expect(p).toBeCloseTo((825 - 645) / 3, 5);
  });
});

describe("carry", () => {
  const dCurve = new Array<number | null>(12).fill(70);
  it("is negative after a short nap, decays at 0.85/h, and ignores future naps", () => {
    const napEnd = at(0, 9, 40);
    const naps = [{ end: napEnd, durMin: 40, onsetClockMin: 9 * 60 }];
    const c0 = carryAt(naps, napEnd, 0.5, dCurve, 70);
    expect(c0).toBeCloseTo((40 - 70) * 0.5, 5);
    const c2 = carryAt(naps, napEnd + 2 * HOUR, 0.5, dCurve, 70);
    expect(c2).toBeCloseTo(-15 * 0.85 * 0.85, 5);
    expect(carryAt(naps, napEnd - HOUR, 0.5, dCurve, 70)).toBe(0);
  });

  it("is positive after a longer-than-expected nap", () => {
    const naps = [{ end: at(0, 10, 30), durMin: 100, onsetClockMin: 9 * 60 }];
    expect(carryAt(naps, at(0, 10, 30), 0.5, dCurve, 70)).toBeCloseTo(15, 5);
  });
});

describe("wEffAt", () => {
  const curve = { knots: [100, 100, 100, 100, 100, 100] };
  it("clamps carry to ±25% of W", () => {
    expect(wEffAt(curve, -80, 9 * 60)).toBe(75);
    expect(wEffAt(curve, 80, 9 * 60)).toBe(125);
    expect(wEffAt(curve, -10, 9 * 60)).toBe(90);
  });
});

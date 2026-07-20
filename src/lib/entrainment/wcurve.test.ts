import { describe, expect, it } from "vitest";
import { applyWCurveUpdate, foldWCurve, wAt } from "./wcurve";
import type { LatencyObservation } from "./latency";
import { foldHistory } from "./history";
import { regularLog, at } from "./sim/kit";

const CURVE = { knots: [100, 110, 120, 130, 140, 130] };
const PRIOR = [100, 110, 120, 130, 140, 130];

const obsAt = (clockH: number, target: number, weight = 1, n = 3): LatencyObservation[] =>
  Array.from({ length: n }, () => ({ clockMin: clockH * 60, targetMin: target, weight }));

describe("wAt", () => {
  it("interpolates linearly and is flat outside the knots", () => {
    expect(wAt(CURVE, 6 * 60)).toBe(100);
    expect(wAt(CURVE, 7.5 * 60)).toBe(105);
    expect(wAt(CURVE, 3 * 60)).toBe(100);
    expect(wAt(CURVE, 23 * 60)).toBe(130);
  });
});

describe("applyWCurveUpdate", () => {
  it("steps at most ±15 min per knot (half the median residual)", () => {
    const up = applyWCurveUpdate(CURVE, obsAt(9, 200), PRIOR);
    expect(up.knots[1]).toBe(125); // +15 cap despite +90 residual
    const small = applyWCurveUpdate(CURVE, obsAt(9, 122), PRIOR);
    expect(small.knots[1]).toBe(116); // half of +12
  });

  it("requires ≥3 observations near a knot", () => {
    const up = applyWCurveUpdate(CURVE, obsAt(9, 200, 1, 2), PRIOR);
    expect(up.knots[1]).toBe(110);
  });

  it("clamps to ±35% of the age prior", () => {
    let c = CURVE;
    for (let i = 0; i < 20; i++) c = applyWCurveUpdate(c, obsAt(9, 400), PRIOR);
    expect(c.knots[1]).toBeLessThanOrEqual(110 * 1.35 + 1e-9);
  });

  it("enforces rough monotonicity (next ≥ prev − 10)", () => {
    const c = applyWCurveUpdate({ knots: [150, 150, 150, 150, 150, 150] }, obsAt(9, 60), [150, 150, 150, 150, 150, 150]);
    // knot 1 stepped down 15 → 135; knots 2+ may trail by at most 10 below each predecessor
    expect(c.knots[1]).toBeGreaterThanOrEqual(c.knots[0] - 10);
  });

  it("weights hard-settle evidence above censored confirmations", () => {
    const confirm = obsAt(9, 130, 0.25, 3);
    const hard = obsAt(9, 100, 1, 2);
    const c = applyWCurveUpdate(CURVE, [...confirm, ...hard], PRIOR);
    expect(c.knots[1]).toBeLessThan(110); // hard evidence dominates the weighted median
  });
});

describe("foldWCurve", () => {
  it("drifts toward consistently longer realized windows", () => {
    // Naps at 10:00/14:00 with ~200/210-min windows vs a ~150-min 26wk prior.
    const log = regularLog(21, [
      [10, 0, 60],
      [14, 30, 60],
    ]);
    const now = at(21, 12, 0);
    const days = foldHistory(log, [], 19 * 60 + 30, now).filter((d) => d.resolved && d.wellFormed);
    const curve = foldWCurve(days, null, now);
    const neutralMorning = 140; // 26-week prior at 9:00
    expect(wAt(curve, 9 * 60)).toBeGreaterThan(neutralMorning);
  });

  it("is a no-op without learning days", () => {
    const curve = foldWCurve([], null, at(0, 12, 0));
    expect(curve.knots.length).toBe(6);
  });
});

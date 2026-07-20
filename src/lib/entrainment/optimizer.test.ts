import { describe, expect, it } from "vitest";
import { optimizeDay, type OptimizerInput } from "./optimizer";
import { carryAt, wEffAt } from "./pressure";
import { clockMin } from "./math";
import { at } from "./sim/kit";
import type { Anchor } from "./types";

const MIN = 60_000;

const baseInput = (over: Partial<OptimizerInput> = {}): OptimizerInput => ({
  now: at(0, 6, 30),
  lastWake: at(0, 6, 30),
  completedNaps: [],
  completedOrdinals: 0,
  daySleepSoFarMin: 0,
  dayBudgetMin: 180,
  bedtimeTarget: at(0, 19, 30),
  bedtimeWeight: 1.4,
  capBias: false,
  wcurve: { knots: [130, 140, 150, 165, 180, 155] },
  dCurve: new Array<number | null>(12).fill(null),
  priorNapMin: 60,
  dischargeWeight: 0.5,
  anchors: [],
  ...over,
});

const windows = (input: OptimizerInput, result: ReturnType<typeof optimizeDay>) => {
  const out: { windowMin: number; wEff: number }[] = [];
  let prev = input.lastWake;
  for (const nap of result.naps) {
    const carry = carryAt(input.completedNaps, nap.start, input.dischargeWeight, input.dCurve, input.priorNapMin);
    out.push({ windowMin: (nap.start - prev) / MIN, wEff: wEffAt(input.wcurve, carry, clockMin(nap.start)) });
    prev = nap.end;
  }
  const carry = carryAt(input.completedNaps, result.bedtime, input.dischargeWeight, input.dCurve, input.priorNapMin);
  out.push({ windowMin: (result.bedtime - prev) / MIN, wEff: wEffAt(input.wcurve, carry, clockMin(result.bedtime)) });
  return out;
};

describe("optimizeDay — hard constraints", () => {
  it("never violates the [0.8, 1.2]·W_eff band on any window", () => {
    for (const budget of [120, 180, 240]) {
      const input = baseInput({ dayBudgetMin: budget });
      const result = optimizeDay(input);
      for (const w of windows(input, result)) {
        expect(w.windowMin).toBeGreaterThanOrEqual(0.8 * w.wEff - 1e-6);
        expect(w.windowMin).toBeLessThanOrEqual(1.2 * w.wEff + 1e-6);
      }
    }
  });

  it("plans no nap under 30 minutes", () => {
    const result = optimizeDay(baseInput({ dayBudgetMin: 90 }));
    for (const nap of result.naps) expect(nap.durMin).toBeGreaterThanOrEqual(30);
  });

  it("quantizes all outputs to the 5-min grid", () => {
    const result = optimizeDay(baseInput());
    for (const nap of result.naps) {
      expect(Math.round(clockMin(nap.start)) % 5).toBe(0);
      expect(nap.durMin % 5).toBe(0);
    }
    expect(Math.round(clockMin(result.bedtime)) % 5).toBe(0);
  });

  it("hits the bedtime target on a normal day", () => {
    const result = optimizeDay(baseInput());
    expect(result.bedtimeFeasible).toBe(true);
    expect(Math.abs(result.bedtime - at(0, 19, 30))).toBeLessThanOrEqual(10 * MIN);
  });
});

describe("optimizeDay — anchors", () => {
  it("pulls a nap toward a nearby anchor", () => {
    const free = optimizeDay(baseInput());
    const target = clockMin(free.naps[0].start) + 20;
    const anchor: Anchor = { ordinal: 1, clockMin: target, weight: 0.7, madMin: 5, daysUnobserved: 0 };
    const pulled = optimizeDay(baseInput({ anchors: [anchor] }));
    const freeDev = Math.abs(clockMin(free.naps[0].start) - target);
    const pulledDev = Math.abs(clockMin(pulled.naps[0].start) - target);
    expect(pulledDev).toBeLessThan(freeDev);
  });

  it("ignores an anchor beyond the 30-min pull cap (cannot dictate)", () => {
    const free = optimizeDay(baseInput());
    const farAnchor: Anchor = {
      ordinal: 1,
      clockMin: clockMin(free.naps[0].start) + 240,
      weight: 0.7,
      madMin: 5,
      daysUnobserved: 0,
    };
    const anchored = optimizeDay(baseInput({ anchors: [farAnchor] }));
    // Beyond the cap the anchor term is constant — the plan must not chase it.
    expect(Math.abs(anchored.naps[0].start - free.naps[0].start)).toBeLessThanOrEqual(35 * MIN);
  });
});

describe("optimizeDay — feasibility honesty", () => {
  it("reports infeasible with the closest bedtime when the target cannot be reached", () => {
    // Just woke at 18:45; bedtime target 19:30 is 45 min away — far below
    // 0.8·W_eff. The plan must not fake it.
    const input = baseInput({
      now: at(0, 18, 50),
      lastWake: at(0, 18, 45),
      daySleepSoFarMin: 170,
      dayBudgetMin: 180,
    });
    const result = optimizeDay(input);
    expect(result.bedtimeFeasible).toBe(false);
    expect(result.bedtime).toBeGreaterThan(at(0, 19, 30));
    // closest = earliest in-band bedtime
    const w = windows(input, result);
    expect(w[w.length - 1].windowMin).toBeGreaterThanOrEqual(0.8 * w[w.length - 1].wEff - 1e-6);
  });

  it("caps a nap when the budget requires it", () => {
    const input = baseInput({
      now: at(0, 14, 0),
      lastWake: at(0, 14, 0),
      daySleepSoFarMin: 150,
      dayBudgetMin: 185,
      dCurve: new Array<number | null>(12).fill(80),
    });
    const result = optimizeDay(input);
    const capped = result.naps.find((n) => n.capped);
    expect(capped).toBeDefined();
    expect(capped!.durMin).toBeLessThan(80);
  });

  it("relaxes forward when now is already past the comfortable band", () => {
    const input = baseInput({
      now: at(0, 11, 0), // awake since 6:30 — 270 min, way past 1.2·W
      lastWake: at(0, 6, 30),
    });
    const result = optimizeDay(input);
    expect(result.naps.length).toBeGreaterThan(0);
    expect(result.naps[0].start).toBeGreaterThan(input.now);
    expect(result.naps[0].start - input.now).toBeLessThanOrEqual(20 * MIN);
  });
});

describe("optimizeDay — performance", () => {
  it("solves 50 varied days in well under a second", () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      optimizeDay(
        baseInput({
          now: at(0, 6, 30) + i * 7 * MIN,
          dayBudgetMin: 120 + (i % 5) * 30,
          anchors: [
            { ordinal: 2, clockMin: 12 * 60 + (i % 3) * 10, weight: 0.6, madMin: 10, daysUnobserved: 0 },
          ],
        }),
      );
    }
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

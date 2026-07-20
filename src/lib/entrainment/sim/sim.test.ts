// Closed-loop simulation battery — the system-level answer to the design
// doc's blocking open question: does the entrainment loop converge without
// ringing? Each test drives the real planner against a hidden ground-truth
// baby (plan → stochastic realization → log → refold), day after day, and
// asserts on the emergent behaviour of the whole feedback system rather than
// any single module. Seeded, so deterministic across runs.
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../settingsSchema";
import type { SharedSettings } from "../../types";
import { buildModel } from "../planner";
import { wAt } from "../wcurve";
import { runSim, regularBaby, noisyBaby, type SimResult } from "./synthetic";
import { at, sleep } from "./kit";

const settings: SharedSettings = { ...DEFAULT_SETTINGS, birthdate: null };

// ---- small stats helpers (test-local, no rounding surprises) ----
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const std = (a: number[]): number => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const tail = (r: SimResult, lo: number, hi: number) =>
  r.metrics.filter((m) => m.day >= lo && m.day <= hi);
const totalBandViolations = (r: SimResult) => r.metrics.reduce((a, m) => a + m.bandViolations, 0);

const range = (a: number[]): number => Math.max(...a) - Math.min(...a);

/** Longest run of consecutive days on which any anchor is "strong" (w > 0.4). */
const longestStrongAnchorRun = (r: SimResult): number => {
  let run = 0;
  let max = 0;
  for (const m of r.models) {
    if (m.anchors.some((a) => a.weight > 0.4)) run++;
    else run = 0;
    max = Math.max(max, run);
  }
  return max;
};

const wNoon = (r: SimResult, day: number): number => wAt(r.models[day - 2].wcurve, 12 * 60);

describe("closed-loop simulation", () => {
  describe("convergence", () => {
    it("learns the 24h sleep need to within 30 min of truth by day 21", () => {
      const r = runSim(30, regularBaby(), settings, 7);
      const day21 = r.metrics.find((m) => m.day === 21)!;
      expect(Math.abs(day21.learned24hMin - regularBaby().need24hMin)).toBeLessThan(30);
    });

    it("holds the bedtime target on-plan once settled (mean dev < 10 min, days 30–45)", () => {
      const r = runSim(46, regularBaby(), settings, 7);
      expect(mean(tail(r, 30, 45).map((m) => m.bedtimeDevMin))).toBeLessThan(10);
    });
  });

  describe("no ringing (days 20–60)", () => {
    // The design doc's stability contract: every feedback loop damped below
    // unit gain, so the steady state is quiet — not a limit cycle.
    const r = runSim(62, regularBaby(), settings, 7);
    const window = tail(r, 20, 60);

    it("day-budget standard deviation stays under 20 min", () => {
      expect(std(window.map((m) => m.dayBudgetMin))).toBeLessThan(20);
    });

    it("expected-night standard deviation stays under 20 min", () => {
      expect(std(window.map((m) => m.expectedNightMin))).toBeLessThan(20);
    });

    it("keeps the day budget in a tight band — no growing limit cycle", () => {
      // The doc's blocking question: does the short-night → long-day-sleep →
      // short-night loop ring? The α=0.3, ±40 min damping keeps combined loop
      // gain < 1, so the budget tracks noise in a narrow band (peak-to-peak
      // well under the single-night correction clamp) instead of oscillating.
      expect(range(window.map((m) => m.dayBudgetMin))).toBeLessThan(45);
    });

    it("neither drifts nor diverges — early and late halves agree within 10 min", () => {
      const budgets = window.map((m) => m.dayBudgetMin);
      const mid = Math.floor(budgets.length / 2);
      expect(Math.abs(mean(budgets.slice(0, mid)) - mean(budgets.slice(mid)))).toBeLessThan(10);
    });
  });

  describe("hard safety (never violated)", () => {
    it("emits zero band violations for a regular baby over 60 days", () => {
      expect(totalBandViolations(runSim(62, regularBaby(), settings, 7))).toBe(0);
    });

    it("emits zero band violations for a noisy baby over 60 days", () => {
      expect(totalBandViolations(runSim(62, noisyBaby(), settings, 3))).toBe(0);
    });
  });

  describe("anchors — entrainment memory forms only for a real rhythm", () => {
    it("forms a strong anchor (w > 0.4, tight cluster) for a regular baby by day 14", () => {
      const r = runSim(20, regularBaby(), settings, 7);
      const day14 = r.models[14 - 2];
      const strong = day14.anchors.filter((a) => a.weight > 0.4);
      expect(strong.length).toBeGreaterThanOrEqual(1);
      expect(Math.min(...strong.map((a) => a.madMin))).toBeLessThan(15);
    });

    it("never sustains a spurious anchor for a noisy baby", () => {
      // A genuinely irregular schedule (realized onset MAD ~40–50 min) may
      // throw a chance-tight window, but the tightness-gated confidence streak
      // never lets one persist: strong-anchor days stay rare and short-lived.
      for (const seed of [1, 2, 3]) {
        const r = runSim(56, noisyBaby(), settings, seed);
        const strongDays = r.models.filter((m) => m.anchors.some((a) => a.weight > 0.4)).length;
        expect(strongDays).toBeLessThan(r.models.length * 0.1); // < 10% of days
        expect(longestStrongAnchorRun(r)).toBeLessThanOrEqual(6); // and never persistent
      }
    }, 30000);
  });

  describe("regime shift", () => {
    it("tracks a baby becoming overtired-prone (W* −30 at day 30) within 3 weeks, no overshoot", () => {
      // An observable shift: when the true comfortable window shrinks, the baby
      // starts fighting the now-too-long windows (hard settles), and W(t) is
      // pulled down toward the new truth without shooting past it.
      const r = runSim(62, regularBaby(), settings, 7, (day, b) => {
        if (day === 30) b.wStarKnots = b.wStarKnots.map((k) => k - 30);
      });
      const preShift = wNoon(r, 29);
      const afterThreeWeeks = wNoon(r, 51);
      const truth = regularBaby().wStarKnots[2] - 30; // noon knot, post-shift
      expect(afterThreeWeeks).toBeLessThan(preShift - 5); // moved down materially
      expect(afterThreeWeeks).toBeGreaterThan(truth - 10); // but not past truth (no overshoot)
    });

    it("keeps W(t) bounded near the prior with no divergence when nothing changes", () => {
      const r = runSim(62, regularBaby(), settings, 7);
      const noons = r.models.map((_, i) => wAt(r.models[i].wcurve, 12 * 60));
      // Never runs away from the prior in either direction (±35% clamp holds,
      // and the closed loop supplies no signal to push it far).
      expect(Math.min(...noons)).toBeGreaterThan(120);
      expect(Math.max(...noons)).toBeLessThan(200);
    });
  });

  describe("determinism (the two-device guarantee)", () => {
    it("produces bit-identical metrics for the same seed", () => {
      const a = runSim(30, regularBaby(), settings, 11);
      const b = runSim(30, regularBaby(), settings, 11);
      expect(a.metrics).toEqual(b.metrics);
    });
  });

  describe("day-start reclassification is absorbed by the fold", () => {
    // History-level merge/refund is unit-tested in history.test.ts; here we
    // confirm a long series peppered with morning resleeps still folds into
    // clean, resolved days and a stable learned budget.
    it("resolves merged mornings and keeps the budget in the age-prior range", () => {
      const log = [];
      for (let d = 0; d < 30; d++) {
        // Every 4th morning: wake at 6:30, then resleep 25 min later → merges
        // back into the night, day restarts at the resleep's end.
        if (d % 4 === 0 && d > 0) {
          log.push(sleep(at(d, 6, 30), at(d, 6, 55))); // brief re-settle, merged
        }
        log.push(sleep(at(d, 9, 0), at(d, 10, 0)));
        log.push(sleep(at(d, 12, 30), at(d, 13, 40)));
        log.push(sleep(at(d, 16, 0), at(d, 16, 35)));
        log.push(sleep(at(d, 19, 30), at(d + 1, 6, 30)));
      }
      const model = buildModel(log, settings, at(30, 12, 0));
      const mergedDays = model.days.filter(
        (day) => day.dayStart !== null && new Date(day.dayStart).getHours() === 6 && new Date(day.dayStart).getMinutes() === 55,
      );
      expect(mergedDays.length).toBeGreaterThanOrEqual(5); // the injections resolved as merges
      // Budget stays sane: within the neutral age-prior's 24h range.
      expect(model.learned24hMin).toBeGreaterThan(model.prior.total24hMin - model.prior.totalRangeMin - 1);
      expect(model.learned24hMin).toBeLessThan(model.prior.total24hMin + model.prior.totalRangeMin + 1);
    });
  });
});

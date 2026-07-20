// The day optimizer: choose the rest of the day's nap onsets (0–4, 5-min
// grid) plus budget caps so that every wake window sits inside the hard
// [0.8, 1.2]·W_eff band and the soft cost — bedtime deviation (strictness-
// weighted), anchor pulls (capped), budget deviation, window centering —
// is minimal. Depth-first enumeration with branch-and-bound over a
// precomputed 5-min lattice; no solver.
import { MIN_MS } from "../time";
import { clockMin, roundTo } from "./math";
import { carryAt, dOf, wEffAt, type CompletedNap } from "./pressure";
import { BAND_LO, BAND_HI } from "./wcurve";
import type { Anchor, PlannedNap, WCurve } from "./types";

const GRID_MIN = 5;
const GRID_MS = GRID_MIN * MIN_MS;
const MIN_NAP_MIN = 30;
const MAX_REMAINING_NAPS = 4;
const ANCHOR_PULL_CAP_MIN = 30;
const BUDGET_WEIGHT = 1.0;
const CENTER_WEIGHT = 0.08; // small: distributes lateness across windows
const BED_SATURATE_MIN = 90;
const LATEST_NAP_ONSET_CLOCK = 22 * 60;
const LATEST_BEDTIME_CLOCK = 23 * 60 + 55;
// When `now` has already drifted past the comfortable band, "sleep soon".
const RELAX_WINDOW_MIN = 15;
// Lattice covers 20h from the last wake — more than any rest-of-day.
const LATTICE_SLOTS = (20 * 60) / GRID_MIN;

export interface OptimizerInput {
  now: number;
  lastWake: number;
  completedNaps: CompletedNap[]; // today, for carry
  completedOrdinals: number; // anchor-eligible naps already realized today
  daySleepSoFarMin: number;
  dayBudgetMin: number;
  bedtimeTarget: number | null; // epoch ms; null = pressure-implied only
  bedtimeWeight: number; // strictness weight; 0 disables the bedtime term
  capBias: boolean; // diagnostics: trim the last nap a bit harder
  wcurve: WCurve;
  dCurve: (number | null)[];
  priorNapMin: number;
  dischargeWeight: number;
  anchors: Anchor[];
}

export interface OptimizerResult {
  naps: PlannedNap[];
  bedtime: number;
  bedtimeFeasible: boolean;
  plannedDaySleepMin: number;
}

interface Candidate {
  t: number;
  clock: number;
  windowMin: number;
  wEff: number;
}

// Precomputed lattice: clock time and W_eff at every 5-min slot after the
// last wake. Carry depends only on t (completed naps are fixed), so W_eff
// is a pure function of the slot.
class Lattice {
  readonly base: number;
  readonly clock: number[] = [];
  readonly wEff: number[] = [];
  private napCache = new Map<number, Candidate[]>();
  private bedCache = new Map<number, Candidate[]>();

  constructor(readonly input: OptimizerInput) {
    this.base = roundTo(input.lastWake, GRID_MS);
    for (let s = 0; s <= LATTICE_SLOTS; s++) {
      const t = this.base + s * GRID_MS;
      const c = clockMin(t);
      this.clock.push(c);
      this.wEff.push(
        wEffAt(
          input.wcurve,
          carryAt(input.completedNaps, t, input.dischargeWeight, input.dCurve, input.priorNapMin),
          c,
        ),
      );
    }
  }

  // In-band onset candidates after `prevWake` (a lattice point or the raw
  // last wake). Cached per (prevWake, kind).
  candidates(prevWake: number, bedtime: boolean): Candidate[] {
    const cache = bedtime ? this.bedCache : this.napCache;
    const hit = cache.get(prevWake);
    if (hit) return hit;
    const latestClock = bedtime ? LATEST_BEDTIME_CLOCK : LATEST_NAP_ONSET_CLOCK;
    const earliest = Math.max(this.input.now, prevWake);
    const out: Candidate[] = [];
    const s0 = Math.max(0, Math.ceil((earliest - this.base) / GRID_MS));
    for (let s = s0; s <= LATTICE_SLOTS; s++) {
      const t = this.base + s * GRID_MS;
      const windowMin = (t - prevWake) / MIN_MS;
      if (windowMin <= 0) continue;
      if (windowMin > 8 * 60) break;
      const clock = this.clock[s];
      if (clock > latestClock && clock >= 6 * 60) break;
      const wEff = this.wEff[s];
      if (windowMin < BAND_LO * wEff - 1e-9 || windowMin > BAND_HI * wEff + 1e-9) continue;
      out.push({ t, clock, windowMin, wEff });
    }
    cache.set(prevWake, out);
    return out;
  }

  relaxed(prevWake: number): Candidate[] {
    const out: Candidate[] = [];
    const first = Math.max(0, Math.ceil((this.input.now + MIN_MS - this.base) / GRID_MS));
    for (let s = first; s <= first + RELAX_WINDOW_MIN / GRID_MIN && s <= LATTICE_SLOTS; s++) {
      const t = this.base + s * GRID_MS;
      out.push({ t, clock: this.clock[s], windowMin: (t - prevWake) / MIN_MS, wEff: this.wEff[s] });
    }
    return out;
  }
}

export const optimizeDay = (input: OptimizerInput): OptimizerResult => {
  const lattice = new Lattice(input);
  const targetQ = input.bedtimeTarget === null ? null : roundTo(input.bedtimeTarget, GRID_MS);
  const main = search(lattice, null);
  let feasible = true;
  if (input.bedtimeWeight > 0 && targetQ !== null) {
    feasible = main !== null && reachable(lattice, targetQ);
  }
  let best = main;
  if (!feasible && targetQ !== null) {
    // Feasibility honesty: re-solve for the closest achievable bedtime.
    best = search(lattice, targetQ) ?? main;
  }
  if (!best) {
    // Degenerate (n=0 always yields a bedtime candidate via relaxation, so
    // this is belt-and-braces): one comfortable window from the last wake.
    const w = lattice.wEff[Math.min(LATTICE_SLOTS, 30)];
    const bt = roundTo(input.lastWake + Math.round(w) * MIN_MS, GRID_MS);
    return { naps: [], bedtime: bt, bedtimeFeasible: false, plannedDaySleepMin: input.daySleepSoFarMin };
  }
  return {
    naps: best.naps,
    bedtime: best.bedtime,
    bedtimeFeasible: feasible,
    plannedDaySleepMin: input.daySleepSoFarMin + best.naps.reduce((a, n) => a + n.durMin, 0),
  };
};

interface Leaf {
  naps: PlannedNap[];
  bedtime: number;
  cost: number;
}

// Full search. When `forceBedtime` is set, bedtime-target deviation becomes
// the dominant objective (closest-feasible fallback).
const search = (lattice: Lattice, forceBedtime: number | null): Leaf | null => {
  const input = lattice.input;
  const budgetRemaining = Math.max(0, input.dayBudgetMin - input.daySleepSoFarMin);
  let best: Leaf | null = null;

  const bedtimeCost = (bt: number): number => {
    if (forceBedtime !== null) return 500 * (Math.abs(bt - forceBedtime) / MIN_MS);
    if (input.bedtimeWeight <= 0 || input.bedtimeTarget === null) return 0;
    const devMin = Math.abs(bt - input.bedtimeTarget) / MIN_MS;
    return input.bedtimeWeight * Math.min(devMin, BED_SATURATE_MIN);
  };

  const tryLeaf = (naps: PlannedNap[], prevWake: number, partialCost: number): void => {
    let candidates = lattice.candidates(prevWake, true);
    if (!candidates.length && !naps.length) candidates = lattice.relaxed(prevWake);
    const planned = naps.reduce((a, n) => a + n.durMin, 0);
    const budgetCost = BUDGET_WEIGHT * Math.abs(planned - budgetRemaining);
    for (const c of candidates) {
      const cost =
        partialCost + bedtimeCost(c.t) + budgetCost + CENTER_WEIGHT * Math.abs(c.windowMin - c.wEff);
      if (!best || cost < best.cost) best = { naps: [...naps], bedtime: c.t, cost };
    }
  };

  const descend = (
    naps: PlannedNap[],
    prevWake: number,
    remaining: number,
    partialCost: number,
  ): void => {
    if (best && partialCost >= best.cost) return;
    tryLeaf(naps, prevWake, partialCost);
    if (remaining <= 0) return;
    let candidates = lattice.candidates(prevWake, false);
    if (!candidates.length && !naps.length) candidates = lattice.relaxed(prevWake);
    // Explore well-centered onsets first so branch-and-bound prunes early.
    candidates = [...candidates].sort(
      (a, b) => Math.abs(a.windowMin - a.wEff) - Math.abs(b.windowMin - b.wEff),
    );
    for (const c of candidates.slice(0, 25)) {
      const ordinal = input.completedOrdinals + naps.length + 1;
      const nominal = Math.max(
        MIN_NAP_MIN,
        roundTo(dOf(input.dCurve, input.priorNapMin, c.clock), GRID_MIN),
      );
      const plannedSoFar = naps.reduce((a, n) => a + n.durMin, 0);
      const room = budgetRemaining - plannedSoFar;
      // Duration candidates: the expected duration, and — when the budget
      // requires — the budget-implied cap (capBias trims 10 min harder).
      const durOptions: { durMin: number; capped: boolean }[] = [{ durMin: nominal, capped: false }];
      if (room < nominal) {
        const capped = Math.max(
          MIN_NAP_MIN,
          roundTo(Math.max(room, 0), GRID_MIN) - (input.capBias ? 10 : 0),
        );
        if (capped < nominal) durOptions.push({ durMin: capped, capped: true });
      }
      const anchor = input.anchors.find((a) => a.ordinal === ordinal);
      const anchorCost = anchor
        ? anchor.weight * Math.min(Math.abs(c.clock - anchor.clockMin), ANCHOR_PULL_CAP_MIN)
        : 0;
      const stepCost = anchorCost + CENTER_WEIGHT * Math.abs(c.windowMin - c.wEff);
      for (const opt of durOptions) {
        const nap: PlannedNap = {
          ordinal,
          start: c.t,
          end: c.t + opt.durMin * MIN_MS,
          durMin: opt.durMin,
          capped: opt.capped,
          anchored: !!anchor && anchor.weight >= 0.1,
          current: false,
        };
        naps.push(nap);
        descend(naps, nap.end, remaining - 1, partialCost + stepCost);
        naps.pop();
      }
    }
  };

  descend([], input.lastWake, MAX_REMAINING_NAPS, 0);
  return best;
};

// Can any constraint-satisfying branch put bedtime exactly on the target?
const reachable = (lattice: Lattice, targetQ: number): boolean => {
  const memo = new Map<string, boolean>();
  const seek = (prevWake: number, depth: number): boolean => {
    const key = `${prevWake}|${depth}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let bts = lattice.candidates(prevWake, true);
    if (!bts.length && depth === 0) bts = lattice.relaxed(prevWake);
    let ok = bts.some((c) => Math.abs(c.t - targetQ) < GRID_MS);
    if (!ok && depth < MAX_REMAINING_NAPS) {
      let candidates = lattice.candidates(prevWake, false);
      if (!candidates.length && depth === 0) candidates = lattice.relaxed(prevWake);
      for (const c of candidates) {
        if (c.t >= targetQ) break;
        const nominal = Math.max(
          MIN_NAP_MIN,
          roundTo(dOf(lattice.input.dCurve, lattice.input.priorNapMin, c.clock), GRID_MIN),
        );
        if (seek(c.t + nominal * MIN_MS, depth + 1)) {
          ok = true;
          break;
        }
        // The capped variant reaches earlier wake-ups than the nominal one.
        if (nominal > MIN_NAP_MIN && seek(c.t + MIN_NAP_MIN * MIN_MS, depth + 1)) {
          ok = true;
          break;
        }
      }
    }
    memo.set(key, ok);
    return ok;
  };
  return seek(lattice.input.lastWake, 0);
};

export const bandForNext = (
  input: OptimizerInput,
  plannedOnset: number,
): { earliest: number; latest: number } => {
  const carry = carryAt(
    input.completedNaps,
    plannedOnset,
    input.dischargeWeight,
    input.dCurve,
    input.priorNapMin,
  );
  const wEff = wEffAt(input.wcurve, carry, clockMin(plannedOnset));
  return {
    earliest: input.lastWake + Math.round(BAND_LO * wEff) * MIN_MS,
    latest: input.lastWake + Math.round(BAND_HI * wEff) * MIN_MS,
  };
};

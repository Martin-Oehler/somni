// Expected nap duration d(t) per 2h clock bucket, and the intra-day carry
// accumulator — how today's reality bends today's plan between replans.
import { HOUR_MS } from "../time";
import { clamp, median } from "./math";
import type { AgePrior, DayRecord, WCurve } from "./types";
import { wAt } from "./wcurve";

export const D_CURVE_WINDOW_DAYS = 14;
const MIN_BUCKET_OBS = 4;
export const CARRY_DECAY_PER_HOUR = 0.85;
export const CARRY_CLAMP_FRACTION = 0.25;
export const DISCHARGE_WEIGHT_INIT = 0.5;
const DISCHARGE_WEIGHT_MIN = 0.2;
const DISCHARGE_WEIGHT_MAX = 0.8;
const DISCHARGE_EVAL_DAYS = 14;

export const priorNapMinutes = (prior: AgePrior): number =>
  (prior.total24hMin - prior.nightMin) / Math.max(1, Math.round(prior.napCount));

/** 14-day median nap duration per 2h clock bucket; null = fall back to prior. */
export const buildDCurve = (learningDays: DayRecord[]): (number | null)[] => {
  const window = learningDays.slice(-D_CURVE_WINDOW_DAYS);
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (const day of window) {
    for (const nap of day.naps) {
      if (!nap.anchorEligible) continue;
      buckets[Math.floor(nap.onsetClockMin / 120) % 12].push(nap.durMin);
    }
  }
  return buckets.map((b) => (b.length >= MIN_BUCKET_OBS ? median(b) : null));
};

export const dOf = (dCurve: (number | null)[], priorNapMin: number, clockMinute: number): number =>
  dCurve[Math.floor(((clockMinute % 1440) + 1440) % 1440 / 120) % 12] ?? priorNapMin;

export interface CompletedNap {
  end: number;
  durMin: number;
  onsetClockMin: number;
}

/** Signed carry minutes at instant t from today's completed naps. */
export const carryAt = (
  naps: CompletedNap[],
  t: number,
  dischargeWeight: number,
  dCurve: (number | null)[],
  priorNapMin: number,
): number => {
  let carry = 0;
  for (const nap of naps) {
    if (nap.end > t) continue;
    const quality = (nap.durMin - dOf(dCurve, priorNapMin, nap.onsetClockMin)) * dischargeWeight;
    carry += quality * Math.pow(CARRY_DECAY_PER_HOUR, (t - nap.end) / HOUR_MS);
  }
  return carry;
};

/** W_eff = W(t) + carry clamped to ±25% of W(t). */
export const wEffAt = (curve: WCurve, carryMin: number, clockMinute: number): number => {
  const w = wAt(curve, clockMinute);
  return w + clamp(carryMin, -CARRY_CLAMP_FRACTION * w, CARRY_CLAMP_FRACTION * w);
};

/**
 * Slowly learn how strongly a nap's quality discharges pressure: every two
 * weeks, ±0.1 — but only when carry-adjusted windows actually predicted the
 * realized windows better (or worse) than the raw curve on carry-heavy naps.
 */
export const foldDischargeWeight = (
  learningDays: DayRecord[],
  curve: WCurve,
  priorNapMin: number,
): number => {
  let dw = DISCHARGE_WEIGHT_INIT;
  let since = 0;
  for (let i = 0; i < learningDays.length; i++) {
    since++;
    if (since < DISCHARGE_EVAL_DAYS) continue;
    since = 0;
    const window = learningDays.slice(Math.max(0, i - DISCHARGE_EVAL_DAYS + 1), i + 1);
    const dCurve = buildDCurve(learningDays.slice(Math.max(0, i - D_CURVE_WINDOW_DAYS + 1), i + 1));
    const effErr: number[] = [];
    const baseErr: number[] = [];
    for (const day of window) {
      const done: CompletedNap[] = [];
      for (const nap of day.naps) {
        if (nap.anchorEligible && nap.windowBeforeMin !== null && done.length) {
          const carry = carryAt(done, nap.start, dw, dCurve, priorNapMin);
          const w = wAt(curve, nap.onsetClockMin);
          const clamped = clamp(carry, -CARRY_CLAMP_FRACTION * w, CARRY_CLAMP_FRACTION * w);
          if (Math.abs(clamped) > 10) {
            effErr.push(Math.abs(nap.windowBeforeMin - (w + clamped)));
            baseErr.push(Math.abs(nap.windowBeforeMin - w));
          }
        }
        done.push({ end: nap.end, durMin: nap.durMin, onsetClockMin: nap.onsetClockMin });
      }
    }
    if (effErr.length >= 5) {
      if (median(effErr) + 2 < median(baseErr)) dw += 0.1;
      else if (median(effErr) > median(baseErr) + 2) dw -= 0.1;
      dw = clamp(dw, DISCHARGE_WEIGHT_MIN, DISCHARGE_WEIGHT_MAX);
    }
  }
  return dw;
};

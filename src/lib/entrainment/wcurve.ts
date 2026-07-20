// W(t): after how much awake time sleep comes easily, as a function of local
// clock time. Piecewise-linear knots at clock hours [6,9,12,15,18,21], flat
// outside; updated at most once per 7 resolved days by bounded steps toward
// the evidence-weighted median latency residual.
import { clamp, weightedMedian } from "./math";
import { priorForAgeWeeks, NEUTRAL_AGE_WEEKS, ageWeeksAt } from "./priors";
import { observationsForDay, type LatencyObservation } from "./latency";
import type { DayRecord, WCurve } from "./types";
import { WCURVE_HOURS } from "./types";

export const BAND_LO = 0.8;
export const BAND_HI = 1.2;
const UPDATE_PERIOD_DAYS = 7;
const OBS_WINDOW_DAYS = 14;
const KNOT_RADIUS_MIN = 90;
const MIN_OBS_PER_KNOT = 3;
const MAX_STEP_MIN = 15;
const MONOTONE_SLACK_MIN = 10;
const PRIOR_CLAMP = 0.35;

/** W at a clock time (minutes after midnight), linear between knots, flat outside. */
export const wAt = (curve: WCurve, clockMinute: number): number => {
  const hours = WCURVE_HOURS;
  const m = clockMinute / 60;
  if (m <= hours[0]) return curve.knots[0];
  if (m >= hours[hours.length - 1]) return curve.knots[hours.length - 1];
  let i = 0;
  while (m > hours[i + 1]) i++;
  const t = (m - hours[i]) / (hours[i + 1] - hours[i]);
  return curve.knots[i] + (curve.knots[i + 1] - curve.knots[i]) * t;
};

const clampToPrior = (knots: number[], priorKnots: number[]): number[] =>
  knots.map((k, i) => clamp(k, priorKnots[i] * (1 - PRIOR_CLAMP), priorKnots[i] * (1 + PRIOR_CLAMP)));

const roughMonotone = (knots: number[]): number[] => {
  const out = [...knots];
  for (let i = 1; i < out.length; i++) {
    if (out[i] < out[i - 1] - MONOTONE_SLACK_MIN) out[i] = out[i - 1] - MONOTONE_SLACK_MIN;
  }
  return out;
};

export const applyWCurveUpdate = (
  curve: WCurve,
  observations: LatencyObservation[],
  priorKnots: number[],
): WCurve => {
  const knots = [...curve.knots];
  for (let i = 0; i < WCURVE_HOURS.length; i++) {
    const center = WCURVE_HOURS[i] * 60;
    const near = observations.filter((o) => Math.abs(o.clockMin - center) <= KNOT_RADIUS_MIN);
    if (near.length < MIN_OBS_PER_KNOT) continue;
    const residual = weightedMedian(
      near.map((o) => o.targetMin - wAt(curve, o.clockMin)),
      near.map((o) => o.weight),
    );
    knots[i] += clamp(residual * 0.5, -MAX_STEP_MIN, MAX_STEP_MIN);
  }
  return { knots: clampToPrior(roughMonotone(knots), priorKnots) };
};

/**
 * Chronological fold over learning days (resolved, well-formed, regular):
 * one bounded update per 7 days from the trailing 14 days' observations.
 */
export const foldWCurve = (
  learningDays: DayRecord[],
  birthdate: string | null,
  now: number,
): WCurve => {
  const priorAt = (ts: number) =>
    priorForAgeWeeks(ageWeeksAt(birthdate, ts) ?? NEUTRAL_AGE_WEEKS);
  const initRef = learningDays.length ? (learningDays[0].dayStart ?? now) : now;
  let curve: WCurve = { knots: [...priorAt(initRef).knots] };
  let sinceUpdate = 0;
  for (let i = 0; i < learningDays.length; i++) {
    sinceUpdate++;
    if (sinceUpdate < UPDATE_PERIOD_DAYS) continue;
    sinceUpdate = 0;
    const window = learningDays.slice(Math.max(0, i - OBS_WINDOW_DAYS + 1), i + 1);
    const obs = window.flatMap((d) => observationsForDay(d, (c) => wAt(curve, c)));
    const ref = learningDays[i].dayStart ?? now;
    curve = applyWCurveUpdate(curve, obs, priorAt(ref).knots);
  }
  // Final safety clamp against the child's current age prior.
  return { knots: clampToPrior(curve.knots, priorAt(now).knots) };
};

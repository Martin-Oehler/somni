// Day-sleep budget: how much day sleep to plan for. learned24h follows the
// data through a clamped median with a slew limit; a short last night only
// partially inflates today's budget (α=0.3, ±40 min) — the anti-oscillation
// core keeping the short-night → long-day-sleep loop gain well below 1.
import { clamp, clockMin, median } from "./math";
import { priorForAgeWeeks, NEUTRAL_AGE_WEEKS, ageWeeksAt } from "./priors";
import type { DayRecord } from "./types";

const WINDOW_DAYS = 14;
const SLEW_MIN_PER_DAY = 10;
const NIGHT_CORRECTION_ALPHA = 0.3;
const NIGHT_CORRECTION_CLAMP_MIN = 40;
const FULL_BLEND_NIGHTS = 14;

export interface BudgetState {
  learned24hMin: number;
  nightMedianMin: number | null;
  dayStartMedianClockMin: number | null;
  nightCount: number;
}

export const foldBudget = (
  learningDays: DayRecord[],
  birthdate: string | null,
  now: number,
): BudgetState => {
  const priorAt = (ts: number) => priorForAgeWeeks(ageWeeksAt(birthdate, ts) ?? NEUTRAL_AGE_WEEKS);
  let learned = priorAt(learningDays[0]?.dayStart ?? now).total24hMin;
  const totals: number[] = [];
  for (const day of learningDays) {
    if (day.totalSleepMin === null) continue;
    totals.push(day.totalSleepMin);
    const prior = priorAt(day.dayStart ?? now);
    const target = clamp(
      median(totals.slice(-WINDOW_DAYS)),
      prior.total24hMin - prior.totalRangeMin,
      prior.total24hMin + prior.totalRangeMin,
    );
    learned += clamp(target - learned, -SLEW_MIN_PER_DAY, SLEW_MIN_PER_DAY);
  }
  const window = learningDays.slice(-WINDOW_DAYS);
  const nights = window.map((d) => d.nightDurMin).filter((n): n is number => n !== null);
  const starts = window
    .map((d) => (d.dayStart !== null ? clockMin(d.dayStart) : null))
    .filter((s): s is number => s !== null);
  return {
    learned24hMin: learned,
    nightMedianMin: nights.length ? median(nights) : null,
    dayStartMedianClockMin: starts.length ? median(starts) : null,
    nightCount: nights.length,
  };
};

/** Blend of the observed night median and the schedule-implied night. */
export const expectedNightMinutes = (
  state: BudgetState,
  bedtimeMins: number,
  priorNightMin: number,
): number => {
  const scheduleNight =
    (state.dayStartMedianClockMin ?? 6 * 60 + 30) + 1440 - bedtimeMins;
  const nightMedian = state.nightMedianMin ?? priorNightMin;
  const alpha = state.nightCount >= FULL_BLEND_NIGHTS ? 0.7 : 0.5;
  return alpha * nightMedian + (1 - alpha) * scheduleNight;
};

export const dayBudgetMinutes = (
  learned24hMin: number,
  expectedNightMin: number,
  actualLastNightMin: number | null,
  diagnosticsNudgeMin: number,
): number => {
  const base = learned24hMin - expectedNightMin;
  const correction =
    actualLastNightMin === null
      ? 0
      : clamp(
          NIGHT_CORRECTION_ALPHA * (expectedNightMin - actualLastNightMin),
          -NIGHT_CORRECTION_CLAMP_MIN,
          NIGHT_CORRECTION_CLAMP_MIN,
        );
  return Math.max(0, base + correction + diagnosticsNudgeMin);
};

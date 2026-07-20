// The latency signal: how W(t) learns it is wrong. Settle time is a censored
// observation — an un-annotated sleep is assumed a quick settle (≤20 min) and
// weakly confirms the realized wake window; an annotated hard settle (≥25 min)
// is strong evidence whose direction comes from context.
import { clockMin } from "./math";
import type { DayRecord } from "./types";

export interface LatencyObservation {
  clockMin: number; // clock time of the sleep onset
  targetMin: number; // what the wake window "should" have been
  weight: number; // 0.25 censored-normal · 1.0 annotated hard settle
}

export const HARD_SETTLE_MIN = 25;
const CONFIRM_WEIGHT = 0.25;
const HARD_ADJUST_MIN = 10;

const observation = (
  onsetClockMin: number,
  windowMin: number,
  settleMins: number | null,
  w: number,
): LatencyObservation => {
  if (settleMins !== null && settleMins >= HARD_SETTLE_MIN) {
    // Direction from context: a hard settle after a window above W means the
    // child overshot into overtiredness (W is locally too high); after a
    // window below W, pressure had not built yet (W is locally too low).
    const target = windowMin >= w ? w - HARD_ADJUST_MIN : w + HARD_ADJUST_MIN;
    return { clockMin: onsetClockMin, targetMin: target, weight: 1 };
  }
  // Censored ≤20 min: weak evidence the realized window was about right.
  return { clockMin: onsetClockMin, targetMin: windowMin, weight: CONFIRM_WEIGHT };
};

/** All latency observations a resolved day yields (naps + night onset). */
export const observationsForDay = (
  day: DayRecord,
  wAtClock: (clockMinute: number) => number,
): LatencyObservation[] => {
  const out: LatencyObservation[] = [];
  for (const nap of day.naps) {
    if (!nap.anchorEligible || nap.windowBeforeMin === null) continue;
    if (nap.windowBeforeMin <= 0 || nap.windowBeforeMin > 12 * 60) continue;
    out.push(
      observation(nap.onsetClockMin, nap.windowBeforeMin, nap.settleMins, wAtClock(nap.onsetClockMin)),
    );
  }
  if (day.nightOnset !== null) {
    const lastNap = [...day.naps].reverse().find((n) => !n.ongoing);
    const lastWake = lastNap?.end ?? day.dayStart;
    if (lastWake !== null) {
      const windowMin = (day.nightOnset - lastWake) / 60_000;
      const clock = clockMin(day.nightOnset);
      if (windowMin > 0 && windowMin <= 12 * 60) {
        out.push(observation(clock, windowMin, day.nightOnsetSettleMins, wAtClock(clock)));
      }
    }
  }
  return out;
};

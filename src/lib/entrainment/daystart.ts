// Day-start plausibility floor: the earliest clock time a wake can start
// the day. P10 of resolved day-start clock times over the trailing window,
// defaulting to 06:00 and clamped to 04:30–08:00. A wake before the floor
// is a night waking, not a morning.
import { clamp } from "./math";

export const FLOOR_DEFAULT_MIN = 6 * 60;
export const FLOOR_MIN = 4 * 60 + 30;
export const FLOOR_MAX = 8 * 60;
export const FLOOR_WINDOW_DAYS = 14;

// Resleep within this many minutes of a candidate morning wake reclassifies
// the wake as a night waking (the sleep merges back into the night).
export const RESETTLE_MIN = 45;

const percentile = (sorted: number[], p: number): number => {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

/** Floor from trailing resolved day-start clock minutes (most recent last). */
export const plausibilityFloor = (recentDayStartClockMins: number[]): number => {
  const window = recentDayStartClockMins.slice(-FLOOR_WINDOW_DAYS);
  if (window.length < 4) return FLOOR_DEFAULT_MIN;
  const sorted = [...window].sort((a, b) => a - b);
  return clamp(percentile(sorted, 10), FLOOR_MIN, FLOOR_MAX);
};

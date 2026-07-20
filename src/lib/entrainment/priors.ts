// Age-prior table, interpolated by age in weeks. A null birthdate falls back
// to the 26-week row (a neutral middle-of-the-road baby) with ageWeeks null,
// so age-gated features stay enabled but nothing pretends to know the age.
import type { AgePrior } from "./types";

// 8 rows, 0–156 weeks. Knot values are wake-window minutes at clock hours
// [6, 9, 12, 15, 18, 21] (morning → evening).
export const AGE_PRIOR_TABLE: AgePrior[] = [
  { ageWeeks: 0,   knots: [40, 45, 50, 55, 60, 55],       napCount: 5, total24hMin: 960, totalRangeMin: 120, nightMin: 480 },
  { ageWeeks: 8,   knots: [65, 75, 85, 95, 100, 90],      napCount: 4, total24hMin: 900, totalRangeMin: 105, nightMin: 540 },
  { ageWeeks: 16,  knots: [95, 105, 115, 130, 140, 120],  napCount: 4, total24hMin: 855, totalRangeMin: 90,  nightMin: 600 },
  { ageWeeks: 26,  knots: [130, 140, 150, 165, 180, 155], napCount: 3, total24hMin: 825, totalRangeMin: 90,  nightMin: 645 },
  { ageWeeks: 36,  knots: [150, 160, 175, 190, 200, 175], napCount: 3, total24hMin: 810, totalRangeMin: 90,  nightMin: 660 },
  { ageWeeks: 52,  knots: [165, 175, 190, 205, 210, 185], napCount: 2, total24hMin: 780, totalRangeMin: 90,  nightMin: 660 },
  { ageWeeks: 78,  knots: [195, 215, 235, 245, 235, 200], napCount: 1, total24hMin: 720, totalRangeMin: 90,  nightMin: 645 },
  { ageWeeks: 156, knots: [225, 245, 265, 300, 320, 260], napCount: 1, total24hMin: 660, totalRangeMin: 90,  nightMin: 630 },
];

export const NEUTRAL_AGE_WEEKS = 26;

const WEEK_MS = 7 * 24 * 3_600_000;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const priorForAgeWeeks = (ageWeeks: number): AgePrior => {
  const table = AGE_PRIOR_TABLE;
  if (ageWeeks <= table[0].ageWeeks) return { ...table[0], knots: [...table[0].knots] };
  const last = table[table.length - 1];
  if (ageWeeks >= last.ageWeeks) return { ...last, knots: [...last.knots] };
  let i = 0;
  while (ageWeeks > table[i + 1].ageWeeks) i++;
  const a = table[i];
  const b = table[i + 1];
  const t = (ageWeeks - a.ageWeeks) / (b.ageWeeks - a.ageWeeks);
  return {
    ageWeeks,
    knots: a.knots.map((v, k) => lerp(v, b.knots[k], t)),
    napCount: lerp(a.napCount, b.napCount, t),
    total24hMin: lerp(a.total24hMin, b.total24hMin, t),
    totalRangeMin: lerp(a.totalRangeMin, b.totalRangeMin, t),
    nightMin: lerp(a.nightMin, b.nightMin, t),
  };
};

export const ageWeeksAt = (birthdate: string | null, at: number): number | null => {
  if (!birthdate) return null;
  const born = Date.parse(birthdate);
  if (!Number.isFinite(born)) return null;
  return Math.max(0, (at - born) / WEEK_MS);
};

export const resolvePrior = (
  birthdate: string | null,
  at: number,
): { ageWeeks: number | null; prior: AgePrior } => {
  const ageWeeks = ageWeeksAt(birthdate, at);
  return { ageWeeks, prior: priorForAgeWeeks(ageWeeks ?? NEUTRAL_AGE_WEEKS) };
};

// Test kit: compact builders for session logs (local wall-clock times) and
// a seeded PRNG. Used by unit tests and the closed-loop simulator only.
import type { Session } from "../../types";

export const BASE_YEAR = 2026;
export const BASE_MONTH = 5; // June (0-based)
export const BASE_DAY = 1;

/** Epoch ms at local time `h:m` on day `dayOffset` from the base date. */
export const at = (dayOffset: number, h: number, m = 0): number =>
  new Date(BASE_YEAR, BASE_MONTH, BASE_DAY + dayOffset, h, m).getTime();

let idCounter = 0;
export const sleep = (
  start: number,
  end: number | null,
  settleMins: number | null = null,
): Session => ({ id: `t-${++idCounter}`, start, end, settleMins });

/**
 * A textbook regular baby: night 19:30→06:30 and naps at fixed clock times,
 * for `days` full days starting at base date. Naps given as [startH, startM, durMin].
 */
export const regularLog = (
  days: number,
  naps: [number, number, number][] = [
    [9, 0, 60],
    [12, 30, 70],
    [16, 0, 35],
  ],
  nightStart: [number, number] = [19, 30],
  nightEnd: [number, number] = [6, 30],
): Session[] => {
  const out: Session[] = [];
  for (let d = 0; d < days; d++) {
    for (const [h, m, dur] of naps) {
      out.push(sleep(at(d, h, m), at(d, h, m) + dur * 60_000));
    }
    out.push(sleep(at(d, nightStart[0], nightStart[1]), at(d + 1, nightEnd[0], nightEnd[1])));
  }
  return out;
};

/** mulberry32 — tiny seeded PRNG, deterministic across runs. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Gaussian-ish noise via sum of uniforms (bounded, cheap). */
export const noise = (rng: () => number, sd: number): number =>
  (rng() + rng() + rng() - 1.5) * sd * 1.63;

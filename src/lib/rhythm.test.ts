import { describe, expect, it } from "vitest";
import { computeDays, computeRhythm, computeRhythmStats, minsAfterMidnight, minsAfterNoon } from "./rhythm";
import type { Session } from "./types";
import { HOUR_MS, MIN_MS } from "./time";

// Local wall-clock helper: day 0 = 1 Sep 2026.
const t = (day: number, h: number, m = 0): number => new Date(2026, 8, 1 + day, h, m).getTime();

let seq = 0;
const s = (start: number, end: number | null): Session => ({ id: `s${seq++}`, start, end });

// A settled day: naps at 09:30 and 13:30, night 19:30–06:30.
const settledDay = (d: number): Session[] => [
  s(t(d, 9, 30), t(d, 10, 15)),
  s(t(d, 13, 30), t(d, 14, 45)),
  s(t(d, 19, 30), t(d + 1, 6, 30)),
];

const settledWeek = (from: number, days: number): Session[] =>
  Array.from({ length: days }, (_, i) => settledDay(from + i)).flat();

describe("computeRhythm", () => {
  it("finds no night while sleep is spread evenly around the clock", () => {
    // Newborn: 3h sleeps every 4h, day and night alike.
    const sessions = Array.from({ length: 6 * 14 }, (_, i) => s(t(0, 0) + i * 4 * HOUR_MS, t(0, 3) + i * 4 * HOUR_MS));
    const r = computeRhythm(sessions, t(14, 12));
    expect(r.onset).toBeNull();
    expect(r.nights).toEqual([]);
  });

  it("detects the onset and classifies every night from then on", () => {
    const sessions = settledWeek(0, 10);
    const r = computeRhythm(sessions, t(10, 12));
    expect(r.onset).toBe(t(0, 19, 30));
    expect(r.nights).toHaveLength(10);
    expect(r.nights[0]).toMatchObject({ start: t(0, 19, 30), end: t(1, 6, 30), sleep: 11 * HOUR_MS, complete: true });
    expect(r.nightSessionIds.has(sessions[0].id)).toBe(false); // morning nap
  });

  it("chains tracked night wakings and counts only the sleep between them", () => {
    const sessions = [
      ...settledWeek(0, 7),
      s(t(7, 19, 30), t(8, 1, 0)),
      s(t(8, 1, 45), t(8, 6, 30)), // 45 min feed at night
    ];
    const r = computeRhythm(sessions, t(8, 12));
    const last = r.nights[r.nights.length - 1];
    expect(last.start).toBe(t(7, 19, 30));
    expect(last.end).toBe(t(8, 6, 30));
    expect(last.sleep).toBe(11 * HOUR_MS - 45 * MIN_MS);
  });

  it("keeps a catnap before bed a nap unless bedtime follows right away", () => {
    const sessions = [
      ...settledWeek(0, 7),
      s(t(7, 18, 0), t(7, 18, 20)), // 70 min before bed: nap
      s(t(7, 19, 30), t(8, 6, 30)),
      s(t(8, 19, 0), t(8, 19, 10)), // false start, 20 min before bed: night
      s(t(8, 19, 30), t(9, 6, 30)),
    ];
    const r = computeRhythm(sessions, t(9, 12));
    const [n7, n8] = r.nights.slice(-2);
    expect(n7.start).toBe(t(7, 19, 30));
    expect(n8.start).toBe(t(8, 19, 0));
  });

  it("counts an early-morning resettle as night", () => {
    const sessions = [...settledWeek(0, 7), s(t(7, 19, 30), t(8, 5, 0)), s(t(8, 6, 0), t(8, 7, 30))];
    const r = computeRhythm(sessions, t(8, 12));
    expect(r.nights[r.nights.length - 1].end).toBe(t(8, 7, 30));
  });

  it("flags a partly logged night as incomplete instead of a short night", () => {
    const sessions = [...settledWeek(0, 7), s(t(7, 19, 30), t(8, 0, 45)), ...settledWeek(8, 2)];
    const r = computeRhythm(sessions, t(10, 12));
    const forgotten = r.nights.find((n) => n.start === t(7, 19, 30))!;
    expect(forgotten.complete).toBe(false);
    expect(r.nightSessionIds.has(forgotten.sessionIds[0])).toBe(true); // still not a nap
  });

  it("recognizes tonight's sleep before it reaches midnight", () => {
    const sessions = [...settledWeek(0, 7), s(t(7, 9, 30), t(7, 10, 15)), s(t(7, 19, 40), null)];
    const r = computeRhythm(sessions, t(7, 20, 15));
    const tonight = r.nights[r.nights.length - 1];
    expect(tonight).toMatchObject({ start: t(7, 19, 40), ongoing: true, sleep: 35 * MIN_MS });
  });

  it("moves tonight from a catnap to the real bedtime", () => {
    const base = [...settledWeek(0, 7), s(t(7, 9, 30), t(7, 10, 15))];
    const catnap = s(t(7, 19, 0), t(7, 19, 20));
    const during = computeRhythm([...base, { ...catnap, end: null }], t(7, 19, 10));
    expect(during.nightSessionIds.has(catnap.id)).toBe(true); // can't know yet
    const bed = s(t(7, 20, 30), null);
    const after = computeRhythm([...base, catnap, bed], t(7, 21, 0));
    expect(after.nightSessionIds.has(catnap.id)).toBe(false);
    expect(after.nightSessionIds.has(bed.id)).toBe(true);
  });

  it("doesn't take a nap during the day for tonight", () => {
    const sessions = [...settledWeek(0, 7), s(t(7, 13, 0), null)];
    const r = computeRhythm(sessions, t(7, 13, 30));
    expect(r.nights.every((n) => !n.ongoing)).toBe(true);
  });
});

describe("computeDays", () => {
  it("runs each day from morning wake to bedtime", () => {
    const sessions = settledWeek(0, 8);
    const r = computeRhythm(sessions, t(8, 12));
    const days = computeDays(r, sessions, t(8, 12));
    expect(days[0]).toMatchObject({ start: t(1, 6, 30), end: t(1, 19, 30), napSleep: 2 * HOUR_MS, complete: true });
    expect(days[0].naps).toHaveLength(2);
    const today = days[days.length - 1];
    expect(today).toMatchObject({ start: t(8, 6, 30), ongoing: true, complete: false });
  });

  it("leaves days next to a forgotten night out of the stats", () => {
    // Night 7→8 not logged at all.
    const sessions = [...settledWeek(0, 7), ...settledDay(7).slice(0, -1), ...settledWeek(8, 3)];
    const r = computeRhythm(sessions, t(11, 12));
    const days = computeDays(r, sessions, t(11, 12));
    expect(days.find((d) => d.start === t(7, 6, 30))!.complete).toBe(false);
  });
});

describe("computeRhythmStats", () => {
  it("collects night lengths, bed and wake times, and nap totals of the window", () => {
    const sessions = settledWeek(0, 14);
    const now = t(14, 12);
    const r = computeRhythm(sessions, now);
    const st = computeRhythmStats(r, computeDays(r, sessions, now), now, 7);
    expect(st.nightSleep).toHaveLength(7);
    expect(new Set(st.nightSleep)).toEqual(new Set([11 * HOUR_MS]));
    expect(new Set(st.bedtime)).toEqual(new Set([7 * 60 + 30]));
    expect(new Set(st.wake)).toEqual(new Set([6 * 60 + 30]));
    expect(new Set(st.napTotal)).toEqual(new Set([2 * HOUR_MS]));
    expect(new Set(st.napCount)).toEqual(new Set([2]));
  });
});

describe("time axes", () => {
  it("puts bedtimes either side of midnight on one axis", () => {
    expect(minsAfterNoon(t(0, 19, 30))).toBe(450);
    expect(minsAfterNoon(t(1, 0, 30))).toBe(750);
    expect(minsAfterMidnight(t(1, 6, 45))).toBe(405);
  });
});

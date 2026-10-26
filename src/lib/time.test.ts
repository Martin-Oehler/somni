import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  addDays,
  boundsForDay,
  clampInt,
  compactDur,
  dayBounds,
  dayKey,
  fmtDur,
  weekStart,
} from "./time";

// A fixed local reference: 2026-07-10 12:00 local time.
const NOON = new Date(2026, 6, 10, 12, 0).getTime();

describe("fmtDur", () => {
  it("formats hours and minutes", () => {
    expect(fmtDur(90 * 60_000)).toBe("1h 30m");
    expect(fmtDur(25 * 60_000)).toBe("25m");
    expect(fmtDur(0)).toBe("0m");
    expect(fmtDur(-5)).toBe("0m");
  });
  it("compact form strips spaces", () => {
    expect(compactDur(90 * 60_000)).toBe("1h30m");
  });
});

describe("clampInt", () => {
  it("clamps to range", () => {
    expect(clampInt("500", 15, 360, 180)).toBe(360);
    expect(clampInt("1", 15, 360, 180)).toBe(15);
  });
  it("treats 0 as a valid value, not falsy", () => {
    expect(clampInt("0", 0, 23, 6)).toBe(0);
  });
  it("falls back on garbage", () => {
    expect(clampInt("abc", 0, 23, 6)).toBe(6);
    expect(clampInt(null, 0, 23, 6)).toBe(6);
  });
});

describe("dayKey / dayBounds (dayStart anchoring)", () => {
  it("assigns early-morning times to the previous tracking day", () => {
    const fiveAm = new Date(2026, 6, 10, 5, 0).getTime();
    const sevenAm = new Date(2026, 6, 10, 7, 0).getTime();
    expect(dayKey(fiveAm, 6)).toBe("2026-07-09");
    expect(dayKey(sevenAm, 6)).toBe("2026-07-10");
  });
  it("roundtrips: ts within dayBounds(dayKey(ts))", () => {
    const b = dayBounds(dayKey(NOON, 6), 6);
    expect(NOON).toBeGreaterThanOrEqual(b.start);
    expect(NOON).toBeLessThan(b.end);
    expect(b.end - b.start).toBe(DAY_MS);
    expect(new Date(b.start).getHours()).toBe(6);
  });
  it("dayStart 0 anchors to midnight", () => {
    const b = dayBounds(dayKey(NOON, 0), 0);
    expect(new Date(b.start).getHours()).toBe(0);
  });
});

describe("weekStart", () => {
  it("is Monday-anchored at dayStart", () => {
    // 2026-07-10 is a Friday -> week starts Monday 2026-07-06 06:00
    const ws = weekStart(NOON, 6);
    const d = new Date(ws);
    expect(d.getDay()).toBe(1); // Monday
    expect(d.getHours()).toBe(6);
    expect(NOON - ws).toBeLessThan(7 * DAY_MS);
    expect(NOON).toBeGreaterThanOrEqual(ws);
  });
  it("Sunday belongs to the week started the previous Monday", () => {
    const sunday = new Date(2026, 6, 12, 12, 0).getTime();
    expect(weekStart(sunday, 6)).toBe(weekStart(NOON, 6));
  });
});

describe("HOUR_MS sanity", () => {
  it("constants line up", () => {
    expect(DAY_MS).toBe(24 * HOUR_MS);
  });
});

// Vitest pins TZ=Europe/Berlin (vite.config.ts) so these hit real DST
// transitions: 2026-03-29 (23h day) and 2026-10-25 (25h day).
describe("DST transitions", () => {
  const sweep = (from: Date, hours: number, dayStart: number) => {
    for (let h = 0; h < hours; h++) {
      const ts = from.getTime() + h * HOUR_MS;
      const b = boundsForDay(ts, dayStart);
      expect(ts).toBeGreaterThanOrEqual(b.start);
      expect(ts).toBeLessThan(b.end);
      expect(new Date(b.start).getHours()).toBe(dayStart);
      expect(new Date(b.end).getHours()).toBe(dayStart);
    }
  };

  it("keeps every timestamp inside its own day around fall-back", () => {
    for (const ds of [0, 6, 7, 8, 20]) sweep(new Date(2026, 9, 23, 0), 120, ds);
  });
  it("keeps every timestamp inside its own day around spring-forward", () => {
    for (const ds of [0, 6, 7, 8, 20]) sweep(new Date(2026, 2, 27, 0), 120, ds);
  });
  it("morning after fall-back belongs to the new day (dayStart 8)", () => {
    const b = boundsForDay(new Date(2026, 9, 26, 7, 52).getTime(), 8);
    expect(b.start).toBe(new Date(2026, 9, 25, 8).getTime());
    expect(b.end).toBe(new Date(2026, 9, 26, 8).getTime());
  });
  it("transition days are 25h / 23h long", () => {
    const fall = dayBounds("2026-10-24", 6); // spans the 03:00 switch on the 25th
    const spring = dayBounds("2026-03-28", 6);
    expect(fall.end - fall.start).toBe(25 * HOUR_MS);
    expect(spring.end - spring.start).toBe(23 * HOUR_MS);
  });
  it("addDays keeps wall-clock time across DST", () => {
    const sat = new Date(2026, 9, 24, 6).getTime();
    expect(new Date(addDays(sat, 1)).getHours()).toBe(6);
    expect(new Date(addDays(sat, 7)).getHours()).toBe(6);
    expect(new Date(addDays(addDays(sat, 7), -7)).getTime()).toBe(sat);
  });
  it("weekStart over a DST week is Monday at dayStart", () => {
    const ws = weekStart(new Date(2026, 9, 25, 12).getTime(), 6); // Sunday after fall-back
    expect(new Date(ws).getDay()).toBe(1);
    expect(new Date(ws).getHours()).toBe(6);
    expect(ws).toBe(new Date(2026, 9, 19, 6).getTime());
  });
});

import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS, clampInt, compactDur, dayBounds, dayKey, fmtDur, weekStart } from "./time";

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

import { describe, expect, it } from "vitest";
import { validateFeed, validateSleep } from "./validate";
import type { Session } from "./types";
import { HOUR_MS, MIN_MS } from "./time";

const NOW = new Date(2026, 6, 10, 12, 0).getTime();

const existing: Session[] = [
  { id: "done", start: NOW - 4 * HOUR_MS, end: NOW - 3 * HOUR_MS },
];

describe("validateSleep", () => {
  it("requires a start", () => {
    expect(validateSleep(null, null, [], null, NOW)).toMatch(/start time/i);
  });
  it("rejects future start/end", () => {
    expect(validateSleep(NOW + MIN_MS, null, [], null, NOW)).toMatch(/past/i);
    expect(validateSleep(NOW - HOUR_MS, NOW + MIN_MS, [], null, NOW)).toMatch(/past/i);
  });
  it("rejects end before start", () => {
    expect(validateSleep(NOW - HOUR_MS, NOW - 2 * HOUR_MS, [], null, NOW)).toMatch(/after start/i);
  });
  it("rejects a second active session", () => {
    const active: Session[] = [{ id: "act", start: NOW - HOUR_MS, end: null }];
    expect(validateSleep(NOW - 10 * MIN_MS, null, active, null, NOW)).toMatch(/already active/i);
    // ...but allows editing the active session itself
    expect(validateSleep(NOW - 10 * MIN_MS, null, active, "act", NOW)).toBeNull();
  });
  it("detects overlaps with other sessions", () => {
    expect(validateSleep(NOW - 3.5 * HOUR_MS, NOW - 2 * HOUR_MS, existing, null, NOW)).toMatch(/overlaps/i);
    // Same range is fine when editing that very session
    expect(validateSleep(NOW - 4 * HOUR_MS, NOW - 3 * HOUR_MS, existing, "done", NOW)).toBeNull();
  });
  it("accepts a valid completed session", () => {
    expect(validateSleep(NOW - 2 * HOUR_MS, NOW - HOUR_MS, existing, null, NOW)).toBeNull();
  });
});

describe("validateFeed", () => {
  it("requires a time and rejects future", () => {
    expect(validateFeed(null, NOW)).toMatch(/enter a time/i);
    expect(validateFeed(NOW + MIN_MS, NOW)).toMatch(/past/i);
    expect(validateFeed(NOW - MIN_MS, NOW)).toBeNull();
  });
});

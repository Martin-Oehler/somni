import { describe, expect, it } from "vitest";
import { buildProjections } from "./projection";
import type { Session, SharedSettings } from "./types";
import { HOUR_MS, MIN_MS } from "./time";

const settings: SharedSettings = { targetNapMins: 60, cycleTimeMins: 240, dayStart: 6 };
const NOW = new Date(2026, 6, 10, 12, 0).getTime();
const bounds = { start: NOW - 6 * HOUR_MS, end: NOW + 18 * HOUR_MS };

describe("buildProjections", () => {
  it("returns empty for no sessions", () => {
    expect(buildProjections([], settings, bounds, NOW)).toEqual([]);
  });

  it("projects from the end of the last completed session plus awake window", () => {
    const sessions: Session[] = [{ id: "a", start: NOW - 2 * HOUR_MS, end: NOW - HOUR_MS }];
    const projs = buildProjections(sessions, settings, bounds, NOW);
    // awake = cycle - nap = 180m; next nap starts at end + 180m
    expect(projs[0].start).toBe(NOW - HOUR_MS + 180 * MIN_MS);
    expect(projs[0].end - projs[0].start).toBe(60 * MIN_MS);
  });

  it("projects from expected wake for an active session", () => {
    const sessions: Session[] = [{ id: "a", start: NOW - 30 * MIN_MS, end: null }];
    const projs = buildProjections(sessions, settings, bounds, NOW);
    // expected wake = start + nap (in the future) -> next start = wake + awake
    expect(projs[0].start).toBe(NOW - 30 * MIN_MS + 60 * MIN_MS + 180 * MIN_MS);
  });

  it("skips projections overlapping real sessions", () => {
    const lastEnd = NOW - HOUR_MS;
    const overlappingStart = lastEnd + 180 * MIN_MS + 10 * MIN_MS;
    const sessions: Session[] = [
      { id: "a", start: NOW - 2 * HOUR_MS, end: lastEnd },
      { id: "b", start: overlappingStart, end: overlappingStart + 30 * MIN_MS },
    ];
    const projs = buildProjections(sessions, settings, bounds, NOW);
    for (const p of projs) {
      for (const s of sessions) {
        const se = s.end ?? NOW;
        expect(p.start < se && p.end > s.start).toBe(false);
      }
    }
  });

  it("caps at 64 projections", () => {
    const sessions: Session[] = [{ id: "a", start: NOW - 2 * HOUR_MS, end: NOW - HOUR_MS }];
    const tight: SharedSettings = { targetNapMins: 15, cycleTimeMins: 30, dayStart: 6 };
    const projs = buildProjections(sessions, tight, bounds, NOW);
    expect(projs.length).toBeLessThanOrEqual(64);
  });
});

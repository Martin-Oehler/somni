import { describe, expect, it } from "vitest";
import { foldAnchors, stabilityFactor } from "./anchors";
import { foldHistory } from "./history";
import { at, mulberry32, regularLog, sleep } from "./sim/kit";
import type { Session } from "../types";

const learn = (log: Session[], nDays: number) =>
  foldHistory(log, [], 1170, at(nDays, 12, 0)).filter((d) => d.resolved && d.wellFormed);

describe("foldAnchors", () => {
  it("forms full-weight anchors at the cluster median for a regular baby", () => {
    const days = learn(regularLog(14), 14);
    const anchors = foldAnchors(days);
    expect(anchors.map((a) => a.ordinal)).toEqual([1, 2, 3]);
    expect(anchors[0].clockMin).toBe(9 * 60);
    expect(anchors[1].clockMin).toBe(12 * 60 + 30);
    expect(anchors[0].weight).toBeCloseTo(0.7, 5); // MAD 0, persistent → full weight
  });

  it("crosses w>0.4 within 14 days for a regular baby", () => {
    const anchors = foldAnchors(learn(regularLog(11), 11));
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors[0].weight).toBeGreaterThan(0.4);
  });

  it("never gives a noisy baby a meaningful anchor (w stays ≤ 0.4)", () => {
    const rng = mulberry32(42);
    const log: Session[] = [];
    for (let d = 0; d < 21; d++) {
      const shift = Math.round((rng() - 0.5) * 240); // uniform ±120 min
      log.push(sleep(at(d, 9, 0) + shift * 60_000, at(d, 10, 0) + shift * 60_000));
      log.push(sleep(at(d, 19, 30), at(d + 1, 6, 30)));
    }
    for (const a of foldAnchors(learn(log, 21))) {
      expect(a.weight).toBeLessThanOrEqual(0.4);
    }
  });

  it("needs at least 4 observations", () => {
    const days = learn(regularLog(4), 4); // only 3 resolved well-formed days
    expect(days.length).toBeLessThan(4);
    expect(foldAnchors(days)).toEqual([]);
  });

  it("decays an unobserved ordinal and garbage-collects it", () => {
    const log: Session[] = [];
    for (let d = 0; d < 8; d++) {
      log.push(sleep(at(d, 9, 0), at(d, 10, 0)));
      log.push(sleep(at(d, 12, 30), at(d, 13, 40)));
      log.push(sleep(at(d, 19, 30), at(d + 1, 6, 30)));
    }
    // 20 more days with only ONE nap — ordinal 2 disappears
    for (let d = 8; d < 28; d++) {
      log.push(sleep(at(d, 9, 0), at(d, 10, 0)));
      log.push(sleep(at(d, 19, 30), at(d + 1, 6, 30)));
    }
    const anchors = foldAnchors(learn(log, 28));
    expect(anchors.find((a) => a.ordinal === 2)).toBeUndefined();
  });

  it("clears anchors after a nap-count change sustained 3 days (transition)", () => {
    const log: Session[] = [];
    for (let d = 0; d < 10; d++) {
      log.push(sleep(at(d, 9, 0), at(d, 10, 0)));
      log.push(sleep(at(d, 12, 30), at(d, 13, 40)));
      log.push(sleep(at(d, 16, 0), at(d, 16, 35)));
      log.push(sleep(at(d, 19, 30), at(d + 1, 6, 30)));
    }
    // Transition to 2 naps at NEW times, sustained
    for (let d = 10; d < 14; d++) {
      log.push(sleep(at(d, 10, 0), at(d, 11, 10)));
      log.push(sleep(at(d, 14, 30), at(d, 15, 30)));
      log.push(sleep(at(d, 19, 30), at(d + 1, 6, 30)));
    }
    const anchors = foldAnchors(learn(log, 14));
    // Old 16:00 third-nap anchor must be gone; remaining anchors reflect new times
    const third = anchors.find((a) => a.ordinal === 3);
    expect(third).toBeUndefined();
  });

  it("stability factor is 1 below 15 min MAD and 0 above 45", () => {
    expect(stabilityFactor(10)).toBe(1);
    expect(stabilityFactor(30)).toBeCloseTo(0.5, 5);
    expect(stabilityFactor(50)).toBe(0);
  });
});

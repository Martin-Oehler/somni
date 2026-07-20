import { describe, expect, it } from "vitest";
import { foldHistory } from "./history";
import { at, regularLog, sleep } from "./sim/kit";

const BEDTIME = 19 * 60 + 30;

describe("foldHistory — day segmentation", () => {
  it("segments a regular log into days with naps, night, and day start", () => {
    const log = regularLog(5);
    const now = at(5, 12, 0);
    const days = foldHistory(log, [], BEDTIME, now);
    const resolved = days.filter((d) => d.resolved);
    expect(resolved.length).toBeGreaterThanOrEqual(3);
    const d = resolved[resolved.length - 1];
    expect(d.wellFormed).toBe(true);
    expect(d.naps.map((n) => n.durMin)).toEqual([60, 70, 35]);
    expect(d.naps.map((n) => n.ordinal)).toEqual([1, 2, 3]);
    expect(d.nightDurMin).toBeCloseTo(11 * 60, 5);
    expect(new Date(d.dayStart!).getHours()).toBe(6);
    expect(d.totalSleepMin).toBeCloseTo(60 + 70 + 35 + 660, 5);
  });

  it("classifies night gaps: <10 brief, 10–45 waking, >45 split", () => {
    const log = [
      sleep(at(0, 9, 0), at(0, 10, 0)),
      // fragmented night: 19:30–23:00, 5m gap, 23:05–02:00, 30m gap, 02:30–04:00, 60m gap, 05:00–06:30
      sleep(at(0, 19, 30), at(0, 23, 0)),
      sleep(at(0, 23, 5), at(1, 2, 0)),
      sleep(at(1, 2, 30), at(1, 4, 0)),
      sleep(at(1, 5, 0), at(1, 6, 30)),
      sleep(at(1, 9, 0), at(1, 10, 0)),
      sleep(at(1, 19, 30), at(2, 6, 30)),
    ];
    const days = foldHistory(log, [], BEDTIME, at(2, 12, 0));
    const day0 = days.find((d) => d.naps.length && d.nightGaps.length)!;
    expect(day0.nightGaps.map((g) => g.kind)).toEqual(["brief", "waking", "split"]);
    expect(day0.splitNight).toBe(true);
    // Night duration excludes the gaps.
    expect(day0.nightDurMin).toBeCloseTo(210 + 175 + 90 + 90, 5);
  });

  it("merges a resleep within 45 min of the morning wake back into the night", () => {
    const log = [
      sleep(at(0, 19, 30), at(1, 6, 0)),
      sleep(at(1, 6, 30), at(1, 7, 15)), // resleep 30 min after waking — still night
      sleep(at(1, 10, 0), at(1, 11, 0)), // real first nap
      sleep(at(1, 19, 30), at(2, 6, 30)),
    ];
    const days = foldHistory(log, [], BEDTIME, at(2, 12, 0));
    const day1 = days.find((d) => d.dayKey.endsWith("-02"))!;
    expect(new Date(day1.dayStart!).getHours()).toBe(7); // day restarts at merged chain end
    expect(day1.naps.length).toBe(1);
    expect(day1.naps[0].windowBeforeMin).toBeCloseTo(165, 5);
  });

  it("flags an early waking without resettle and starts the day there", () => {
    const log = [
      sleep(at(0, 19, 30), at(1, 5, 0)), // wakes 05:00, floor is 06:00
      sleep(at(1, 8, 30), at(1, 9, 30)), // no resleep until 08:30
      sleep(at(1, 19, 30), at(2, 6, 30)),
    ];
    const days = foldHistory(log, [], BEDTIME, at(2, 12, 0));
    const day1 = days.find((d) => d.dayKey.endsWith("-02"))!;
    expect(day1.earlyWakeNoResettle).toBe(true);
    expect(new Date(day1.dayStart!).getHours()).toBe(5);
  });

  it("keeps a split night together across a >45 min pre-dawn gap", () => {
    const log = [
      sleep(at(0, 19, 30), at(1, 1, 0)),
      sleep(at(1, 3, 0), at(1, 6, 30)), // 2h calm gap at 1am — still one night
      sleep(at(1, 9, 0), at(1, 10, 0)),
      sleep(at(1, 19, 30), at(2, 6, 30)),
    ];
    const days = foldHistory(log, [], BEDTIME, at(2, 12, 0));
    const day0 = days.find((d) => d.splitNight)!;
    expect(day0.nightDurMin).toBeCloseTo(330 + 210, 5);
    const day1 = days.find((d) => d.dayKey.endsWith("-02"))!;
    expect(new Date(day1.dayStart!).getHours()).toBe(6);
  });

  it("marks today unresolved and its <45-min-old day start provisional", () => {
    const log = [
      ...regularLog(2),
      sleep(at(2, 19, 30), at(3, 6, 30)), // last night ends 06:30 today
    ];
    const now = at(3, 6, 50); // woke 20 min ago
    const days = foldHistory(log, [], BEDTIME, now);
    const today = days[days.length - 1];
    expect(today.resolved).toBe(false);
    expect(today.provisionalStart).toBe(true);
    expect(today.dayStart).toBe(at(3, 6, 30));
  });

  it("counts <10 min naps for budget but not as anchor-eligible ordinals", () => {
    const log = [
      sleep(at(0, 19, 30), at(1, 6, 30)),
      sleep(at(1, 9, 0), at(1, 9, 5)), // 5-min blip
      sleep(at(1, 12, 0), at(1, 13, 0)),
      sleep(at(1, 19, 30), at(2, 6, 30)),
    ];
    const days = foldHistory(log, [], BEDTIME, at(2, 12, 0));
    const day1 = days.find((d) => d.dayKey.endsWith("-02"))!;
    expect(day1.naps.length).toBe(2);
    expect(day1.naps[0].anchorEligible).toBe(false);
    expect(day1.naps[0].ordinal).toBe(0);
    expect(day1.naps[1].ordinal).toBe(1);
    expect(day1.daySleepMin).toBeCloseTo(65, 5);
  });

  it("treats an ongoing evening session as the (incomplete) night", () => {
    const log = [...regularLog(2), sleep(at(2, 19, 40), null)];
    const now = at(2, 22, 0);
    const days = foldHistory(log, [], BEDTIME, now);
    const today = days[days.length - 1];
    expect(today.resolved).toBe(false);
    expect(today.nightOnset).toBe(at(2, 19, 40));
    expect(today.nightEnd).toBeNull();
  });

  it("excludes irregular days from nothing structurally (flag only)", () => {
    const log = regularLog(3);
    const days = foldHistory(log, ["2026-06-02"], BEDTIME, at(3, 12, 0));
    const flagged = days.find((d) => d.dayKey === "2026-06-02");
    expect(flagged?.irregular).toBe(true);
    expect(flagged?.naps.length).toBe(3);
  });

  it("is deterministic", () => {
    const log = regularLog(10);
    const a = foldHistory(log, [], BEDTIME, at(10, 15, 0));
    const b = foldHistory(log, [], BEDTIME, at(10, 15, 0));
    expect(a).toEqual(b);
  });
});

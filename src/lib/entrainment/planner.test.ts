import { describe, expect, it } from "vitest";
import { buildModel, planForNow, modelFingerprint } from "./planner";
import { DEFAULT_SETTINGS } from "../settingsSchema";
import type { SharedSettings } from "../types";
import { at, regularLog, sleep } from "./sim/kit";

const settings = (over: Partial<SharedSettings> = {}): SharedSettings => ({
  ...DEFAULT_SETTINGS,
  birthdate: "2025-12-01", // ~26 weeks at the base date (June 2026)
  ...over,
});

describe("planner", () => {
  it("is deterministic: same inputs ⇒ deep-equal model and plan (two-device guarantee)", () => {
    const log = [...regularLog(20), sleep(at(20, 6, 30 - 660), null)].slice(0, -1);
    const s = settings();
    const now = at(20, 10, 0);
    const m1 = buildModel(log, s, now);
    const m2 = buildModel(log, s, now);
    expect(m1).toEqual(m2);
    expect(planForNow(m1, s, now)).toEqual(planForNow(m2, s, now));
  });

  it("plans the rest of a regular day and hits bedtime", () => {
    const log = regularLog(14); // nights end 06:30; today starts 06:30
    const now = at(14, 7, 0);
    const s = settings();
    const model = buildModel(log, s, now);
    const plan = planForNow(model, s, now);
    expect(plan.phase).toBe("day");
    expect(plan.naps.length).toBeGreaterThanOrEqual(2);
    expect(plan.bedtimeFeasible).toBe(true);
    expect(plan.showBedtime).toBe(true);
    expect(plan.nextWindow).not.toBeNull();
    // first planned nap lands near the entrained 9:00 anchor
    const onset = new Date(plan.naps[0].start);
    expect(Math.abs(onset.getHours() * 60 + onset.getMinutes() - 540)).toBeLessThanOrEqual(45);
  });

  it("freezes the plan during a nap and projects its wake", () => {
    const log = [...regularLog(14), sleep(at(14, 9, 0), null)];
    const now = at(14, 9, 30);
    const s = settings();
    const model = buildModel(log, s, now);
    const plan = planForNow(model, s, now);
    expect(plan.phase).toBe("day");
    expect(plan.naps[0].current).toBe(true);
    expect(plan.naps[0].end).toBeGreaterThan(now - 1);
  });

  it("switches to night phase when the evening sleep is running", () => {
    const log = [...regularLog(14), sleep(at(14, 9, 0), at(14, 10, 0)), sleep(at(14, 19, 35), null)];
    const now = at(14, 20, 30);
    const s = settings();
    const plan = planForNow(buildModel(log, s, now), s, now);
    expect(plan.phase).toBe("night");
    expect(plan.bedtime).toBe(at(14, 19, 35));
    expect(plan.expectedNightMin).toBeGreaterThan(500);
  });

  it("disables anchors and the bedtime row under 16 weeks", () => {
    const log = regularLog(14);
    const now = at(14, 7, 0);
    const s = settings({ birthdate: "2026-04-15" }); // ~7 weeks old
    const model = buildModel(log, s, now);
    expect(model.entrainmentEnabled).toBe(false);
    expect(model.anchors).toEqual([]);
    const plan = planForNow(model, s, now);
    expect(plan.showBedtime).toBe(false);
    expect(plan.naps.length).toBeGreaterThan(0);
  });

  it("emits a setup hint without a birthdate but still plans", () => {
    const log = regularLog(14);
    const now = at(14, 7, 0);
    const s = settings({ birthdate: null });
    const plan = planForNow(buildModel(log, s, now), s, now);
    expect(plan.hints.some((h) => h.kind === "setup")).toBe(true);
    expect(plan.naps.length).toBeGreaterThan(0);
  });

  it("returns an empty-phase plan with no data", () => {
    const s = settings();
    const now = at(0, 12, 0);
    const plan = planForNow(buildModel([], s, now), s, now);
    expect(plan.phase).toBe("empty");
  });

  it("warns when now is past the comfortable window", () => {
    const log = regularLog(14);
    const now = at(14, 11, 30); // awake since 06:30 — way past any 26wk window
    const s = settings();
    const plan = planForNow(buildModel(log, s, now), s, now);
    expect(plan.hints.some((h) => h.kind === "overtired")).toBe(true);
  });

  it("fingerprint changes only on model-relevant inputs", () => {
    const log = regularLog(3);
    const s = settings();
    const fp = modelFingerprint(log, s);
    expect(modelFingerprint([...log], { ...s })).toBe(fp);
    expect(modelFingerprint(log, { ...s, bedtimeMins: 1200 })).not.toBe(fp);
    expect(modelFingerprint([...log, sleep(at(3, 9, 0), at(3, 9, 30))], s)).not.toBe(fp);
    expect(modelFingerprint(log, { ...s, targetNapMins: 90 })).toBe(fp); // legacy field is irrelevant
  });

  it("full model build over months of data stays fast", () => {
    const log = regularLog(120);
    const s = settings();
    const now = at(120, 10, 0);
    const t0 = performance.now();
    const model = buildModel(log, s, now);
    planForNow(model, s, now);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(500);
  });
});

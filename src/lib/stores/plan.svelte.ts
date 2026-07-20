// The entrainment plan, derived from the synced session log + settings.
//
// Two reactivity guards keep the model from thrashing (the design doc's two
// named failure modes):
//   1. The model is a fingerprint-memoized fold — reconcile's array-identity
//      churn re-runs the cheap fingerprint check but never re-folds unless the
//      log or plan-relevant settings actually changed.
//   2. `clock.now` never enters model derivation, and the plan reads time only
//      through a coarse 5-minute bucket, so the 30s clock tick can't re-optimize
//      the day. The bucket also gives the doc's stale-plan guard for free: a
//      plan is at most ~5 min stale once `now` drifts past a planned onset.
import { buildModel, planForNow, modelFingerprint } from "../entrainment/planner";
import { civilDate } from "../entrainment/math";
import type { DayPlan, ModelState } from "../entrainment/types";
import type { PlannedBlock } from "../types";
import { data } from "./data.svelte";
import { settings } from "./settings.svelte";
import { clock } from "./clock.svelte";

const PLAN_BUCKET_MS = 5 * 60_000;

class PlanStore {
  #cache: { key: string; model: ModelState } | null = null;

  // Coarse clock: identical within a 5-min bucket, so downstream deriveds
  // (which compare by value/identity) don't recompute on every 30s tick.
  planNow = $derived(Math.floor(clock.now / PLAN_BUCKET_MS) * PLAN_BUCKET_MS);

  model = $derived.by((): ModelState => {
    const now = this.planNow;
    // Fold key = data/settings fingerprint + civil day, so a midnight rollover
    // with no logging still rebuilds "today" while identity churn does not.
    const key = `${modelFingerprint(data.sessions, settings.shared)}#${civilDate(now)}`;
    if (!this.#cache || this.#cache.key !== key) {
      this.#cache = { key, model: buildModel(data.sessions, settings.shared, now) };
    }
    return this.#cache.model;
  });

  plan = $derived.by((): DayPlan => planForNow(this.model, settings.shared, this.planNow));

  // Planned (not-yet-realized) blocks for the timeline: future naps + bedtime.
  plannedBlocks = $derived.by((): PlannedBlock[] => {
    const p = this.plan;
    const out: PlannedBlock[] = [];
    for (const nap of p.naps) {
      if (nap.current) continue; // the in-progress nap renders as a real session
      out.push({ start: nap.start, end: nap.end, kind: "nap" });
    }
    if (p.showBedtime && p.bedtime !== null && p.phase === "day") {
      out.push({ start: p.bedtime, end: p.bedtime, kind: "bedtime" });
    }
    return out;
  });
}

export const plan = new PlanStore();

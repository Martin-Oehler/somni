// Synthetic closed-loop baby: a ground-truth sleep physiology the planner
// cannot see, driven day by day — plan → stochastic realization → log →
// refold. Test-only; never imported by the app.
import type { Session, SharedSettings } from "../../types";
import { MIN_MS } from "../../time";
import { buildModel, planForNow } from "../planner";
import { wAt } from "../wcurve";
import { carryAt, wEffAt } from "../pressure";
import { clockMin } from "../math";
import type { DayPlan, ModelState } from "../types";
import { at, mulberry32, noise, sleep } from "./kit";

export interface TrueBaby {
  wStarKnots: number[]; // true comfortable wake windows at [6,9,12,15,18,21]
  napDur: (clockMinute: number) => number; // true natural nap length
  need24hMin: number; // true daily sleep need
  onsetNoiseSd: number; // parent/baby compliance noise on onsets (min)
  durNoiseSd: number;
  nightNoiseSd: number;
}

export const regularBaby = (): TrueBaby => ({
  wStarKnots: [140, 150, 160, 170, 180, 165],
  napDur: (c) => (c < 11 * 60 ? 55 : c < 14.5 * 60 ? 85 : 35),
  need24hMin: 840,
  onsetNoiseSd: 6,
  durNoiseSd: 8,
  nightNoiseSd: 12,
});

export const noisyBaby = (): TrueBaby => ({
  ...regularBaby(),
  onsetNoiseSd: 55,
  durNoiseSd: 25,
  nightNoiseSd: 35,
});

export interface SimDayMetrics {
  day: number;
  daySleepMin: number;
  nightDurMin: number;
  dayBudgetMin: number;
  expectedNightMin: number;
  learned24hMin: number;
  bedtimeDevMin: number; // |realized bedtime − target|
  bandViolations: number; // planned windows outside [0.8, 1.2]·W_eff
}

export interface SimResult {
  log: Session[];
  metrics: SimDayMetrics[];
  models: ModelState[]; // model snapshot at each day's start
}

const wStarAt = (baby: TrueBaby, clockMinute: number): number =>
  wAt({ knots: baby.wStarKnots }, clockMinute);

// Count planned windows violating the band the optimizer promised to
// respect. The first window may be relaxed ("sleep soon" when now already
// drifted past the band), so index 0 is exempt.
const planBandViolations = (plan: DayPlan, model: ModelState): number => {
  const today = model.days[model.days.length - 1];
  if (!today) return 0;
  const completed = today.naps
    .filter((n) => !n.ongoing)
    .map((n) => ({ end: n.end, durMin: n.durMin, onsetClockMin: n.onsetClockMin }));
  const lastWake = completed.length ? completed[completed.length - 1].end : today.dayStart;
  if (lastWake === null) return 0;
  const naps = plan.naps.filter((n) => !n.current);
  const points = [...naps.map((n) => n.start), ...(plan.bedtime !== null ? [plan.bedtime] : [])];
  let violations = 0;
  let prev = lastWake;
  for (let i = 0; i < points.length; i++) {
    const t = points[i];
    const carry = carryAt(completed, t, model.dischargeWeight, model.dCurve, model.priorNapMin);
    const wEff = wEffAt(model.wcurve, carry, clockMin(t));
    const windowMin = (t - prev) / MIN_MS;
    const inBand = windowMin >= 0.8 * wEff - 1e-6 && windowMin <= 1.2 * wEff + 1e-6;
    if (!inBand && i > 0) violations++;
    if (i < naps.length) prev = naps[i].end;
  }
  return violations;
};

/**
 * Run `days` simulated days. `mutate` can perturb the true baby at a given
 * day (regime shift) or inject logging quirks.
 */
export const runSim = (
  days: number,
  baby: TrueBaby,
  settings: SharedSettings,
  seed = 1,
  mutate?: (day: number, baby: TrueBaby, log: Session[]) => void,
): SimResult => {
  const rng = mulberry32(seed);
  const log: Session[] = [];
  const metrics: SimDayMetrics[] = [];
  const models: ModelState[] = [];

  // Two bootstrap days of a sensible baby-led schedule so the fold has a
  // day start to work from.
  for (let d = 0; d < 2; d++) {
    log.push(sleep(at(d, 9, 0), at(d, 10, 0)));
    log.push(sleep(at(d, 12, 45), at(d, 14, 0)));
    log.push(sleep(at(d, 16, 30), at(d, 17, 5)));
    log.push(sleep(at(d, 19, 30), at(d + 1, 6, 30)));
  }

  let wake = at(2, 6, 30);
  for (let day = 2; day < days; day++) {
    mutate?.(day, baby, log);
    let daySleepMin = 0;
    let bandViolations = 0;
    let now = wake + 1 * MIN_MS;
    const dayModel = buildModel(log, settings, now);
    models.push(dayModel);

    let lastWake = wake;
    for (let napIndex = 0; napIndex < 6; napIndex++) {
      const model = buildModel(log, settings, now);
      const plan = planForNow(model, settings, now);
      if (plan.phase !== "day" || !plan.naps.length) break;
      const next = plan.naps.find((n) => !n.current);
      if (!next) break;
      bandViolations += planBandViolations(plan, model);

      // Realization: the parent aims for the planned onset; the baby adds
      // noise and an overtired penalty when the window overshot W*.
      const plannedOnset = next.start;
      let onset = plannedOnset + Math.round(noise(rng, baby.onsetNoiseSd)) * MIN_MS;
      if (onset <= lastWake + 10 * MIN_MS) onset = lastWake + 10 * MIN_MS;
      const windowMin = (onset - lastWake) / MIN_MS;
      const wStar = wStarAt(baby, clockMin(onset));
      let settle: number | null = null;
      if (windowMin > 1.15 * wStar) settle = 30 + Math.round(rng() * 15);
      else if (windowMin < 0.75 * wStar) settle = 35 + Math.round(rng() * 20);
      let durMin = Math.round(baby.napDur(clockMin(onset)) + noise(rng, baby.durNoiseSd));
      if (next.capped) durMin = Math.min(durMin, next.durMin);
      durMin = Math.max(12, durMin);
      const end = onset + durMin * MIN_MS;
      log.push(sleep(onset, end, settle));
      daySleepMin += durMin;
      lastWake = end;
      now = end + 1 * MIN_MS;
    }

    // Bedtime: follow the plan (it may be infeasible-honest already).
    const model = buildModel(log, settings, now);
    const plan = planForNow(model, settings, now);
    const targetBt = plan.bedtimeTarget ?? at(day, 19, 30);
    let bedtime = plan.bedtime ?? targetBt;
    if (bedtime <= now) bedtime = now + 10 * MIN_MS;
    const nightDurMin = Math.min(
      750,
      Math.max(540, Math.round(baby.need24hMin - daySleepMin + noise(rng, baby.nightNoiseSd))),
    );
    const nightEnd = bedtime + nightDurMin * MIN_MS;
    log.push(sleep(bedtime, nightEnd));

    metrics.push({
      day,
      daySleepMin,
      nightDurMin,
      dayBudgetMin: plan.dayBudgetMin,
      expectedNightMin: plan.expectedNightMin,
      learned24hMin: model.learned24hMin,
      bedtimeDevMin: Math.abs(bedtime - targetBt) / MIN_MS,
      bandViolations,
    });
    wake = nightEnd;
  }
  return { log, metrics, models };
};

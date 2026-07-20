// Facade of the entrainment engine — the only API the app layer touches.
// buildModel: deterministic chronological fold over the session log.
// planForNow: today's rest-of-day plan from the model + the live session log.
import type { Session, SharedSettings } from "../types";
import { MIN_MS, fmtTime } from "../time";
import { addCivilDays, civilDate, tsAtClockMin } from "./math";
import { resolvePrior } from "./priors";
import { foldHistory } from "./history";
import { foldWCurve } from "./wcurve";
import { buildDCurve, carryAt, foldDischargeWeight, priorNapMinutes, type CompletedNap } from "./pressure";
import { foldBudget, expectedNightMinutes, dayBudgetMinutes } from "./budget";
import { foldAnchors, BEDTIME_WEIGHTS } from "./anchors";
import { foldDiagnostics } from "./diagnostics";
import { optimizeDay, bandForNext, type OptimizerInput } from "./optimizer";
import { dOf } from "./pressure";
import type { DayPlan, DayRecord, Hint, ModelState, PlannedNap } from "./types";

export const ENTRAINMENT_MIN_WEEKS = 16;

export const buildModel = (
  sessions: Session[],
  settings: SharedSettings,
  now: number,
): ModelState => {
  const { ageWeeks, prior } = resolvePrior(settings.birthdate, now);
  const days = foldHistory(sessions, settings.irregularDays, settings.bedtimeMins, now);
  const learning = days.filter((d) => d.resolved && d.wellFormed && !d.irregular);
  const entrainmentEnabled = ageWeeks === null || ageWeeks >= ENTRAINMENT_MIN_WEEKS;

  const wcurve = foldWCurve(learning, settings.birthdate, now);
  const diagnostics = foldDiagnostics(learning);
  if (diagnostics.lateKnotNudgeMin) {
    // Late knots (18:00, 21:00) carry the diagnostics nudge.
    wcurve.knots[4] += diagnostics.lateKnotNudgeMin;
    wcurve.knots[5] += diagnostics.lateKnotNudgeMin;
  }
  const priorNapMin = priorNapMinutes(prior);
  const dCurve = buildDCurve(learning);
  const budget = foldBudget(learning, settings.birthdate, now);

  return {
    builtAt: now,
    ageWeeks,
    prior,
    entrainmentEnabled,
    wcurve,
    dCurve,
    priorNapMin,
    anchors: entrainmentEnabled ? foldAnchors(learning) : [],
    learned24hMin: budget.learned24hMin,
    nightMedianMin: budget.nightMedianMin,
    dayStartMedianClockMin: budget.dayStartMedianClockMin,
    nightCount: budget.nightCount,
    dischargeWeight: foldDischargeWeight(learning, wcurve, priorNapMin),
    diagnostics,
    days,
  };
};

const emptyPlan = (model: ModelState, hints: Hint[]): DayPlan => ({
  phase: "empty",
  dayKey: null,
  naps: [],
  bedtime: null,
  bedtimeTarget: null,
  bedtimeFeasible: true,
  showBedtime: model.entrainmentEnabled,
  daySleepSoFarMin: 0,
  plannedDaySleepMin: 0,
  dayBudgetMin: 0,
  expectedNightMin: model.prior.nightMin,
  carryMin: 0,
  nextWindow: null,
  hints,
});

export const planForNow = (
  model: ModelState,
  settings: SharedSettings,
  now: number,
): DayPlan => {
  const hints: Hint[] = [];
  if (!settings.birthdate) {
    hints.push({ kind: "setup", text: "Set the birthdate in Settings so plans can use age-appropriate rhythms." });
  }
  for (const text of model.diagnostics.hints) hints.push({ kind: "diagnostic", text });

  const today = model.days.length ? model.days[model.days.length - 1] : null;
  const todayKey = civilDate(now);
  if (!today || today.resolved || (today.dayKey !== todayKey && today.dayKey !== addCivilDays(todayKey, -1))) {
    return emptyPlan(model, hints);
  }

  const expectedNight = expectedNightMinutes(
    { learned24hMin: model.learned24hMin, nightMedianMin: model.nightMedianMin, dayStartMedianClockMin: model.dayStartMedianClockMin, nightCount: model.nightCount },
    settings.bedtimeMins,
    model.prior.nightMin,
  );

  // ---- night phase: the following night has begun (or an evening sleep is running) ----
  const nightApproachMin = Math.max(18 * 60, settings.bedtimeMins - 90);
  const ongoingNight = today.nightOnset !== null && today.nightEnd === null;
  const eveningActive = today.naps.find((n) => n.ongoing && n.onsetClockMin >= nightApproachMin);
  if (ongoingNight || eveningActive) {
    const onset = ongoingNight ? today.nightOnset! : eveningActive!.start;
    return {
      phase: "night",
      dayKey: today.dayKey,
      naps: [],
      bedtime: onset,
      bedtimeTarget: tsAtClockMin(onset, settings.bedtimeMins),
      bedtimeFeasible: true,
      showBedtime: model.entrainmentEnabled,
      daySleepSoFarMin: today.daySleepMin,
      plannedDaySleepMin: today.daySleepMin,
      dayBudgetMin: today.daySleepMin,
      expectedNightMin: expectedNight,
      carryMin: 0,
      nextWindow: null,
      hints,
    };
  }

  // ---- day phase ----
  const completed = today.naps.filter((n) => !n.ongoing);
  const active = today.naps.find((n) => n.ongoing) ?? null;
  const completedNaps: CompletedNap[] = completed.map((n) => ({
    end: n.end,
    durMin: n.durMin,
    onsetClockMin: n.onsetClockMin,
  }));
  const daySleepSoFarMin = completed.reduce((a, n) => a + n.durMin, 0);
  const lastWakeBase = completed.length ? completed[completed.length - 1].end : today.dayStart;
  if (lastWakeBase === null && !active) return emptyPlan(model, hints);

  const prev = model.days.length >= 2 ? model.days[model.days.length - 2] : null;
  const lastNight =
    prev && prev.dayKey === addCivilDays(today.dayKey, -1) && !prev.irregular ? prev.nightDurMin : null;
  const dayBudget = dayBudgetMinutes(
    model.learned24hMin,
    expectedNight,
    lastNight,
    model.diagnostics.budgetNudgeMin,
  );

  const bedtimeTarget = tsAtClockMin(now, settings.bedtimeMins);
  const strictness = Math.min(Math.max(Math.round(settings.strictness), 0), 4);
  const base: Omit<OptimizerInput, "now" | "lastWake" | "daySleepSoFarMin" | "completedOrdinals"> = {
    completedNaps,
    dayBudgetMin: dayBudget,
    bedtimeTarget,
    bedtimeWeight: model.entrainmentEnabled ? BEDTIME_WEIGHTS[strictness] : 0,
    capBias: model.diagnostics.capBias,
    wcurve: model.wcurve,
    dCurve: model.dCurve,
    priorNapMin: model.priorNapMin,
    dischargeWeight: model.dischargeWeight,
    anchors: model.anchors,
  };

  let planNaps: PlannedNap[] = [];
  let input: OptimizerInput;
  if (active) {
    // Plan is frozen during a nap — project this nap's wake, then plan the
    // rest of the day from that projected wake.
    const remaining = Math.max(0, dayBudget - daySleepSoFarMin);
    const nominal = dOf(model.dCurve, model.priorNapMin, active.onsetClockMin);
    const durMin = Math.max(30, Math.min(nominal, remaining > 0 ? remaining : 30));
    const projectedEnd = Math.max(now, active.start + Math.round(durMin) * MIN_MS);
    const currentNap: PlannedNap = {
      ordinal: completed.filter((n) => n.anchorEligible).length + 1,
      start: active.start,
      end: projectedEnd,
      durMin: (projectedEnd - active.start) / MIN_MS,
      capped: durMin < nominal - 2,
      anchored: false,
      current: true,
    };
    input = {
      ...base,
      now: projectedEnd,
      lastWake: projectedEnd,
      daySleepSoFarMin: daySleepSoFarMin + currentNap.durMin,
      completedOrdinals: currentNap.ordinal,
    };
    const result = optimizeDay(input);
    planNaps = [currentNap, ...result.naps];
    return finishPlan(model, today, result.bedtimeFeasible, result.bedtime, bedtimeTarget, planNaps, daySleepSoFarMin, dayBudget, expectedNight, 0, null, hints);
  }

  input = {
    ...base,
    now,
    lastWake: lastWakeBase!,
    daySleepSoFarMin,
    completedOrdinals: completed.filter((n) => n.anchorEligible).length,
  };
  const result = optimizeDay(input);
  planNaps = result.naps;

  const carryNow = carryAt(completedNaps, now, model.dischargeWeight, model.dCurve, model.priorNapMin);
  let nextWindow: DayPlan["nextWindow"] = null;
  if (planNaps.length) {
    nextWindow = bandForNext(input, planNaps[0].start);
    if (now > nextWindow.latest) {
      hints.push({ kind: "overtired", text: "Past the comfortable window — sleep soon." });
    }
  }
  return finishPlan(model, today, result.bedtimeFeasible, result.bedtime, bedtimeTarget, planNaps, daySleepSoFarMin, dayBudget, expectedNight, carryNow, nextWindow, hints);
};

const finishPlan = (
  model: ModelState,
  today: DayRecord,
  feasible: boolean,
  bedtime: number,
  bedtimeTarget: number,
  naps: PlannedNap[],
  daySleepSoFarMin: number,
  dayBudgetMin: number,
  expectedNightMin: number,
  carryMin: number,
  nextWindow: DayPlan["nextWindow"],
  hints: Hint[],
): DayPlan => {
  if (!feasible && model.entrainmentEnabled) {
    hints.push({
      kind: "infeasible",
      text: `Bedtime ${fmtTime(bedtimeTarget)} isn't reachable today — closest is ${fmtTime(bedtime)}.`,
    });
  }
  if (naps.some((n) => n.capped && !n.current)) {
    hints.push({ kind: "cap", text: "A nap is kept short so sleep pressure lands at bedtime." });
  }
  return {
    phase: "day",
    dayKey: today.dayKey,
    naps,
    bedtime,
    bedtimeTarget,
    bedtimeFeasible: feasible,
    showBedtime: model.entrainmentEnabled,
    daySleepSoFarMin,
    plannedDaySleepMin: daySleepSoFarMin + naps.reduce((a, n) => a + n.durMin, 0),
    dayBudgetMin,
    expectedNightMin,
    carryMin,
    nextWindow,
    hints,
  };
};

// Fingerprint of everything the model depends on — memoization key so array
// identity churn (reconcile) never triggers a refold.
export const modelFingerprint = (sessions: Session[], settings: SharedSettings): string => {
  const parts: string[] = [];
  for (const s of sessions) {
    parts.push(`${s.start}:${s.end ?? "a"}:${s.settleMins ?? ""}`);
  }
  parts.push(
    `|${settings.birthdate ?? ""}|${settings.bedtimeMins}|${settings.strictness}|${settings.irregularDays.join(",")}`,
  );
  return parts.join(";");
};

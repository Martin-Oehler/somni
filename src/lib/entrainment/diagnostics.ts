// Night diagnostics: weekly-gated, one parameter change per evaluation,
// never same-day. Split nights / long calm wakings alternate between a
// budget trim and a late-knot raise; early wakings bias the last nap;
// brief wakings do — explicitly — nothing. Nudges decay once the trigger
// clears.
import { clamp } from "./math";
import type { DayRecord, DiagnosticsState } from "./types";

const EVAL_PERIOD_DAYS = 7;
const TRIGGER_NIGHTS = 3;
const BUDGET_STEP_MIN = 15;
const KNOT_STEP_MIN = 10;
const NUDGE_CLAMP_MIN = 45;
const DECAY = 0.75;

export const foldDiagnostics = (learningDays: DayRecord[]): DiagnosticsState => {
  let budgetNudge = 0;
  let knotNudge = 0;
  let capBias = false;
  let lastLever: "budget" | "knot" = "knot";
  let hints: string[] = [];
  let since = 0;

  for (let i = 0; i < learningDays.length; i++) {
    since++;
    if (since < EVAL_PERIOD_DAYS) continue;
    since = 0;
    const window = learningDays.slice(Math.max(0, i - EVAL_PERIOD_DAYS + 1), i + 1);
    const splitNights = window.filter((d) => d.splitNight).length;
    const earlyWakes = window.filter((d) => d.earlyWakeNoResettle).length;
    hints = [];

    if (splitNights >= TRIGGER_NIGHTS) {
      // One change per period, alternating levers.
      if (lastLever === "knot") {
        budgetNudge = clamp(budgetNudge - BUDGET_STEP_MIN, -NUDGE_CLAMP_MIN, NUDGE_CLAMP_MIN);
        lastLever = "budget";
      } else {
        knotNudge = clamp(knotNudge + KNOT_STEP_MIN, -NUDGE_CLAMP_MIN, NUDGE_CLAMP_MIN);
        lastLever = "knot";
      }
      hints.push("Restless nights lately — planning slightly less day sleep.");
    } else {
      budgetNudge = Math.abs(budgetNudge) < 2 ? 0 : budgetNudge * DECAY;
      knotNudge = Math.abs(knotNudge) < 2 ? 0 : knotNudge * DECAY;
    }

    if (earlyWakes >= TRIGGER_NIGHTS) {
      capBias = true;
      hints.push("Early wakings this week — a shorter or earlier last nap can help.");
    } else {
      capBias = false;
    }
  }
  return {
    budgetNudgeMin: Math.round(budgetNudge),
    lateKnotNudgeMin: Math.round(knotNudge),
    capBias,
    hints,
  };
};

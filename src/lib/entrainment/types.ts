// Shared types for the entrainment engine. Pure data, no Svelte imports.
// Learned clock-time structures are local wall-clock minutes after midnight
// (DST-proof); instants and durations elsewhere are epoch-ms / minutes.

// Clock hours of the W(t) piecewise-linear knots.
export const WCURVE_HOURS = [6, 9, 12, 15, 18, 21] as const;

export interface AgePrior {
  ageWeeks: number;
  // Wake-window minutes at each WCURVE_HOURS knot (morning → evening).
  knots: number[];
  napCount: number;
  total24hMin: number; // typical 24h sleep total
  totalRangeMin: number; // ± range around total24hMin considered normal
  nightMin: number; // typical night length
}

export interface WCurve {
  knots: number[]; // minutes, aligned to WCURVE_HOURS
}

export interface Anchor {
  ordinal: number; // 1st, 2nd, … nap of the day
  clockMin: number; // minutes after midnight
  weight: number; // 0 … 0.7 (strictly < 1: an anchor biases, never dictates)
  madMin: number;
  daysUnobserved: number;
}

export type NightGapKind = "brief" | "waking" | "split";

export interface NightGap {
  gapMin: number;
  kind: NightGapKind; // <10 brief · 10–45 waking · >45 split-night candidate
}

export interface DayNap {
  start: number;
  end: number;
  durMin: number;
  onsetClockMin: number;
  windowBeforeMin: number | null; // wake window preceding this nap; null if unknown
  ordinal: number; // 1-based among the day's anchor-eligible naps; 0 = ineligible
  anchorEligible: boolean; // false for <10 min naps
  settleMins: number | null;
  ongoing: boolean; // end was null (active session, today only)
}

export interface DayRecord {
  dayKey: string; // civil date (YYYY-MM-DD) of the morning wake
  dayStart: number | null; // epoch ms of the morning wake; null = untracked night before
  resolved: boolean; // false only for the in-progress "today"
  wellFormed: boolean; // has a real day start and a following night (estimator-grade)
  irregular: boolean; // flagged in settings.irregularDays — kept, excluded from learning
  provisionalStart: boolean; // today only: the morning wake could still merge into the night
  naps: DayNap[];
  daySleepMin: number;
  // The night FOLLOWING this day (evening → next morning).
  nightOnset: number | null;
  nightEnd: number | null;
  nightDurMin: number | null; // asleep time within the night block (gaps excluded)
  nightGaps: NightGap[];
  splitNight: boolean; // any >45 min calm gap inside the night
  earlyWakeNoResettle: boolean; // woke before the floor and never resettled
  totalSleepMin: number | null; // daySleepMin + following night; null if night unknown
  nightOnsetSettleMins: number | null; // settle annotation on the night's first session
}

export interface DiagnosticsState {
  budgetNudgeMin: number; // signed, applied to the day budget (clamped ±45)
  lateKnotNudgeMin: number; // signed, applied to the 18:00/21:00 knots (clamped ±45)
  capBias: boolean; // bias toward trimming/advancing the last nap
  hints: string[];
}

export interface ModelState {
  builtAt: number;
  ageWeeks: number | null; // null when no birthdate is set
  prior: AgePrior;
  entrainmentEnabled: boolean; // false under 16 weeks: no anchors, no bedtime term
  wcurve: WCurve;
  dCurve: (number | null)[]; // 12 × 2h buckets, median nap minutes; null = use prior
  priorNapMin: number; // prior fallback for d(t)
  anchors: Anchor[];
  learned24hMin: number;
  nightMedianMin: number | null;
  dayStartMedianClockMin: number | null;
  nightCount: number; // resolved nights feeding the blend
  dischargeWeight: number;
  diagnostics: DiagnosticsState;
  days: DayRecord[]; // chronological; last entry may be today (resolved: false)
}

export interface PlannedNap {
  ordinal: number;
  start: number;
  end: number;
  durMin: number;
  capped: boolean;
  anchored: boolean;
  current: boolean; // the nap in progress right now
}

export type PlanPhase = "day" | "night" | "empty";

export type HintKind = "cap" | "infeasible" | "overtired" | "setup" | "diagnostic";

export interface Hint {
  kind: HintKind;
  text: string;
}

export interface DayPlan {
  phase: PlanPhase;
  dayKey: string | null; // today's key (for the irregular-day toggle)
  naps: PlannedNap[];
  bedtime: number | null; // epoch ms; null before any data exists
  bedtimeTarget: number | null;
  bedtimeFeasible: boolean;
  showBedtime: boolean; // false under 16 weeks (pure pressure mode)
  daySleepSoFarMin: number;
  plannedDaySleepMin: number; // soFar + planned remaining
  dayBudgetMin: number;
  expectedNightMin: number;
  carryMin: number;
  nextWindow: { earliest: number; latest: number } | null; // acceptable next-nap onset range
  hints: Hint[];
}

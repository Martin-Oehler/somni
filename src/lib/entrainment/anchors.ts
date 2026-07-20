// Anchors — the entrainment memory. Realized nap onsets clustered by ordinal
// over the trailing 7 resolved days form soft attractors; weight tops out at
// 0.7 (an anchor biases, never dictates), decays when unobserved, and a
// sustained nap-count change clears the slate (nap transition).
import { clamp, mad, median } from "./math";
import type { Anchor, DayRecord } from "./types";

const CLUSTER_WINDOW_DAYS = 7;
const MIN_CLUSTER_OBS = 4;
const MAX_CLUSTER_MAD_MIN = 45;
const MAX_WEIGHT = 0.7;
const DECAY_PER_DAY = 0.85;
const GC_WEIGHT = 0.05;
const TRANSITION_DAYS = 3;
const MAX_ORDINAL = 6;
// Confidence ramps with how many recent days the cluster stayed *genuinely
// tight* — not merely present. A noisy baby clears the loose validity gate
// (MAD < 45) almost every day, so gating the streak on that lets a run of
// chance-tight windows mint a strong anchor and the optimizer's anchor pull
// then compresses realized onsets around it (self-confirmation). Gating on a
// tight MAD instead means an irregular schedule can never sustain the streak.
const STREAK_FULL_DAYS = 7;
const STREAK_TIGHT_MAD = 15; // a day only builds confidence if this tight
const STREAK_DROP_ON_LOOSE = 2; // wide-but-valid day: bleed confidence
const STREAK_DROP_ON_INVALID = 3; // no cluster at all: bleed faster

// Stability factor: 1.0 at MAD ≤ 15 min, linearly to 0 at MAD ≥ 45 min.
export const stabilityFactor = (madMin: number): number => clamp((45 - madMin) / 30, 0, 1);

/** Bedtime strictness slider (0–4) → bedtime cost weight. */
export const BEDTIME_WEIGHTS = [0.5, 0.9, 1.4, 2.0, 3.0] as const;

export const foldAnchors = (learningDays: DayRecord[]): Anchor[] => {
  const anchors = new Map<number, Anchor>();
  const streaks = new Map<number, number>();
  let stableCount: number | null = null;
  let streakCount: number | null = null;
  let streakLen = 0;
  let transitionIdx = 0; // clustering never reaches past the last nap transition

  for (let i = 0; i < learningDays.length; i++) {
    const day = learningDays[i];

    // Nap-transition detection: a different daily nap count sustained for
    // 3 consecutive days clears all anchors and starts clustering fresh.
    const count = day.naps.filter((n) => n.anchorEligible).length;
    if (count === streakCount) streakLen++;
    else {
      streakCount = count;
      streakLen = 1;
    }
    if (stableCount === null) {
      if (streakLen >= TRANSITION_DAYS) stableCount = count;
    } else if (count !== stableCount && streakLen >= TRANSITION_DAYS) {
      anchors.clear();
      streaks.clear();
      stableCount = count;
      transitionIdx = i - streakLen + 1;
    }

    const window = learningDays.slice(Math.max(transitionIdx, i - CLUSTER_WINDOW_DAYS + 1), i + 1);

    for (let ordinal = 1; ordinal <= MAX_ORDINAL; ordinal++) {
      const onsets = window.flatMap((d) =>
        d.naps.filter((n) => n.ordinal === ordinal).map((n) => n.onsetClockMin),
      );
      const observedToday = day.naps.some((n) => n.ordinal === ordinal);
      const existing = anchors.get(ordinal);
      if (onsets.length >= MIN_CLUSTER_OBS && mad(onsets) < MAX_CLUSTER_MAD_MIN) {
        const madMin = mad(onsets);
        const daysUnobserved = observedToday ? 0 : (existing?.daysUnobserved ?? 0) + 1;
        const prevStreak = streaks.get(ordinal) ?? 0;
        const streak =
          madMin < STREAK_TIGHT_MAD ? prevStreak + 1 : Math.max(0, prevStreak - STREAK_DROP_ON_LOOSE);
        streaks.set(ordinal, streak);
        anchors.set(ordinal, {
          ordinal,
          clockMin: median(onsets),
          madMin,
          daysUnobserved,
          weight:
            MAX_WEIGHT *
            stabilityFactor(madMin) *
            Math.min(1, streak / STREAK_FULL_DAYS) *
            Math.pow(DECAY_PER_DAY, daysUnobserved),
        });
      } else {
        streaks.set(ordinal, Math.max(0, (streaks.get(ordinal) ?? 0) - STREAK_DROP_ON_INVALID));
        if (existing) {
          existing.daysUnobserved++;
          existing.weight *= DECAY_PER_DAY;
          if (existing.weight < GC_WEIGHT) anchors.delete(ordinal);
        }
      }
    }
  }
  return [...anchors.values()].filter((a) => a.weight >= GC_WEIGHT).sort((a, b) => a.ordinal - b.ordinal);
};

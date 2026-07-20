// The recompute backbone: a deterministic chronological fold over the raw
// session log producing DayRecords — night-block detection, day-start
// resolution, nap classification, and night-waking gaps. Historical days
// resolve with full knowledge; only "today" is provisional.
import type { Session } from "../types";
import { ACTIVE_CAP_MS, MIN_MS } from "../time";
import { addCivilDays, civilDate, clockMin, tsAtCivilDate } from "./math";
import { RESETTLE_MIN, plausibilityFloor } from "./daystart";
import type { DayNap, DayRecord, NightGap } from "./types";

// Deep-night reference: every tracked night must cover (or straddle) this
// clock time on the morning it ends. 02:30 sits between any bedtime
// (16:00–23:00) and any day-start floor (04:30–08:00).
const DEEP_NIGHT_MIN = 2 * 60 + 30;
// A session ending at/after this clock time is unambiguously night territory.
const NIGHT_CORE_MIN = 21 * 60;
// Nights never extend past noon.
const NOON_MIN = 12 * 60;
// Naps shorter than this count for budget but are never anchor-eligible.
export const MIN_ANCHOR_NAP_MIN = 10;

export const classifyGap = (gapMin: number): NightGap["kind"] =>
  gapMin < 10 ? "brief" : gapMin <= 45 ? "waking" : "split";

interface EffSession {
  start: number;
  end: number; // effective end (active capped at now/start+12h)
  ongoing: boolean;
  settleMins: number | null;
}

interface Night {
  onset: number;
  end: number | null; // null = still asleep (tonight)
  durMin: number | null;
  gaps: NightGap[];
  split: boolean;
  earlyWake: boolean;
  settleMins: number | null;
}

const effSessions = (sessions: Session[], now: number): EffSession[] =>
  sessions
    .filter((s) => s.start < now && (s.end === null || s.end > s.start))
    .map((s) => ({
      start: s.start,
      end: s.end === null ? Math.min(now, s.start + ACTIVE_CAP_MS) : Math.min(s.end, now),
      ongoing: s.end === null,
      settleMins: s.settleMins ?? null,
    }))
    .sort((a, b) => a.start - b.start);

/**
 * Fold the session log into DayRecords. `bedtimeMins` only informs the
 * evening night-approach heuristic (backward chain merging); all real
 * learning happens downstream of the records.
 */
export const foldHistory = (
  sessions: Session[],
  irregularDays: string[],
  bedtimeMins: number,
  now: number,
): DayRecord[] => {
  const eff = effSessions(sessions, now);
  if (!eff.length) return [];
  const irregular = new Set(irregularDays);
  const nightApproachMin = Math.max(18 * 60, bedtimeMins - 90);

  const claimed = new Array<boolean>(eff.length).fill(false);
  const nights = new Map<string, Night>(); // keyed by the morning's civil date
  const dayStartClocks: number[] = []; // resolved day-start clock minutes, oldest first
  const floors = new Map<string, number>(); // floor used for each morning

  // ---- pass 1: night detection, one candidate night per civil date ----
  const firstKey = civilDate(eff[0].start);
  const lastKey = addCivilDays(civilDate(now), 1); // catch tonight's ongoing chain
  for (let key = firstKey; key <= lastKey; key = addCivilDays(key, 1)) {
    const deepNight = tsAtCivilDate(key) + DEEP_NIGHT_MIN * MIN_MS;
    const floorClock = plausibilityFloor(dayStartClocks);
    floors.set(key, floorClock);
    const floorTs = tsAtCivilDate(key) + floorClock * MIN_MS;

    // Core = the session containing the deep-night point, else the closest
    // session on the evening side (ending within 5h before it), else the
    // early-morning side (starting before the floor).
    let core = -1;
    for (let i = 0; i < eff.length; i++) {
      if (claimed[i] || eff[i].start > deepNight) continue;
      if (eff[i].end > deepNight) core = i; // contains the deep-night point
    }
    if (core < 0) {
      for (let i = 0; i < eff.length; i++) {
        if (claimed[i]) continue;
        if (eff[i].end <= deepNight && eff[i].end > deepNight - 5 * 60 * MIN_MS) core = i;
      }
    }
    if (core < 0) {
      for (let i = 0; i < eff.length; i++) {
        if (claimed[i] || eff[i].start < deepNight || eff[i].start >= floorTs) continue;
        core = i;
        break;
      }
    }
    if (core < 0) continue; // untracked night

    // Backward extension: settling fragmentation and evening night pieces.
    let first = core;
    while (first > 0 && !claimed[first - 1]) {
      const prev = eff[first - 1];
      const prevEndClock = clockMin(prev.end);
      const gapMin = (eff[first].start - prev.end) / MIN_MS;
      const inNightHours = prevEndClock >= NIGHT_CORE_MIN || prevEndClock < floorClock;
      const approaching = prevEndClock >= nightApproachMin && gapMin <= RESETTLE_MIN;
      if (inNightHours || approaching) first--;
      else break;
    }

    // Forward extension — from the chain's FIRST session, so gaps between
    // backward-merged pieces are classified too. Night wakings, split
    // nights, and resettle merges: a wake W survives as the morning only
    // if no resleep starts before max(W + 45 min, floor of W's morning).
    const gaps: NightGap[] = [];
    let last = first;
    let earlyWake = false;
    for (;;) {
      const wake = eff[last].end;
      const wakeClock = clockMin(wake);
      if (eff[last].ongoing) break; // still asleep — night has no end yet
      if (wakeClock >= NOON_MIN && wakeClock < NIGHT_CORE_MIN) break; // safety: never past noon
      const morningKey = wakeClock >= NIGHT_CORE_MIN ? addCivilDays(civilDate(wake), 1) : civilDate(wake);
      const morningFloorClock = floors.get(morningKey) ?? plausibilityFloor(dayStartClocks);
      const morningFloorTs = tsAtCivilDate(morningKey) + morningFloorClock * MIN_MS;
      const deadline = Math.max(wake + RESETTLE_MIN * MIN_MS, morningFloorTs);
      const next = last + 1 < eff.length && !claimed[last + 1] ? eff[last + 1] : null;
      if (next && next.start <= deadline) {
        gaps.push({ gapMin: (next.start - wake) / MIN_MS, kind: classifyGap((next.start - wake) / MIN_MS) });
        last++;
        continue;
      }
      // Wake stands. Early waking = the child was up before the floor and
      // never resettled (or there is simply nothing more logged yet — only
      // count it once the deadline has actually passed).
      if (wakeClock < morningFloorClock && wakeClock < NOON_MIN && (next || now > deadline)) {
        earlyWake = true;
      }
      break;
    }

    let durMin = 0;
    for (let i = first; i <= last; i++) {
      claimed[i] = true;
      durMin += (eff[i].end - eff[i].start) / MIN_MS;
    }
    const ongoing = eff[last].ongoing;
    const end = ongoing ? null : eff[last].end;
    const night: Night = {
      onset: eff[first].start,
      end,
      durMin: ongoing ? null : durMin,
      gaps,
      split: gaps.some((g) => g.kind === "split"),
      earlyWake,
      settleMins: eff[first].settleMins,
    };
    // Key the night by the morning it ends (or would end) on.
    const morningKey = end !== null ? civilDate(end) : key;
    nights.set(morningKey, night);
    if (end !== null && now - end > RESETTLE_MIN * MIN_MS) {
      dayStartClocks.push(clockMin(end));
    }
  }

  // ---- pass 2: day records between consecutive nights ----
  const records: DayRecord[] = [];
  const allKeys = new Set<string>();
  for (const k of nights.keys()) {
    allKeys.add(k);
    allKeys.add(addCivilDays(k, -1)); // the day this night follows (may have no naps)
  }
  for (let i = 0; i < eff.length; i++) {
    if (!claimed[i]) allKeys.add(civilDate(eff[i].start));
  }
  const keys = [...allKeys].sort();

  for (const key of keys) {
    const prevNight = nights.get(key) ?? null; // night ending this morning
    const nextNight = nights.get(addCivilDays(key, 1)) ?? null; // following night
    const dayStart = prevNight?.end ?? null;
    if (prevNight && prevNight.end === null) continue; // ongoing night keyed to tomorrow-ish edge

    // Naps: unclaimed sessions from the morning wake until the next night's
    // onset; without a known day start, fall back to this civil date.
    const from = dayStart ?? tsAtCivilDate(key);
    const to = nextNight?.onset ?? tsAtCivilDate(addCivilDays(key, 1));
    const naps: DayNap[] = [];
    let prevWake = dayStart;
    for (let i = 0; i < eff.length; i++) {
      if (claimed[i] || eff[i].start < from || eff[i].start >= to) continue;
      if (civilDate(eff[i].start) !== key && dayStart === null) continue;
      const s = eff[i];
      const durMin = (s.end - s.start) / MIN_MS;
      naps.push({
        start: s.start,
        end: s.end,
        durMin,
        onsetClockMin: clockMin(s.start),
        windowBeforeMin: prevWake === null ? null : (s.start - prevWake) / MIN_MS,
        ordinal: 0,
        anchorEligible: !s.ongoing && durMin >= MIN_ANCHOR_NAP_MIN,
        settleMins: s.settleMins,
        ongoing: s.ongoing,
      });
      prevWake = s.end;
    }
    let ord = 0;
    for (const n of naps) if (n.anchorEligible) n.ordinal = ++ord;

    const daySleepMin = naps.reduce((a, n) => a + n.durMin, 0);
    const resolved = nextNight !== null && nextNight.end !== null && nextNight.end <= now;
    if (!naps.length && !prevNight && !nextNight) continue;
    records.push({
      dayKey: key,
      dayStart,
      resolved,
      wellFormed: dayStart !== null && nextNight !== null && nextNight.durMin !== null,
      irregular: irregular.has(key),
      provisionalStart: !resolved && dayStart !== null && now - dayStart < RESETTLE_MIN * MIN_MS,
      naps,
      daySleepMin,
      nightOnset: nextNight?.onset ?? null,
      nightEnd: nextNight?.end ?? null,
      nightDurMin: nextNight?.durMin ?? null,
      nightGaps: nextNight?.gaps ?? [],
      splitNight: nextNight?.split ?? false,
      earlyWakeNoResettle: prevNight?.earlyWake ?? false,
      totalSleepMin: nextNight?.durMin != null ? daySleepMin + nextNight.durMin : null,
      nightOnsetSettleMins: nextNight?.settleMins ?? null,
    });
  }
  return records;
};

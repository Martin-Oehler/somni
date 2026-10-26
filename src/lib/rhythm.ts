// Day/night rhythm: splits sleep sessions into night sleep and day naps.
//
// A night is a chain of sessions anchored on the core night hours: the
// session overlapping 00:00–05:00 most is the seed, and neighbours are pulled
// in across short gaps (tracked night wakings, a bedtime that took two tries,
// an early-morning resettle). Night length is the actual sleep inside the
// chain, so untracked wakings simply count as sleep.
//
// Newborns don't have a night yet: until a consolidated night shows up on most
// days of a week (the onset), nothing is classified. After the onset every
// session is either night or nap; nights that look like logging gaps (too
// short to be real) are kept as night but flagged incomplete so they don't
// skew the stats.
import type { Session } from "./types";
import { HOUR_MS, MIN_MS, addDays } from "./time";
import { percentile } from "./stats";

export interface Night {
  start: number; // bedtime: first sleep of the chain
  end: number; // morning wake: end of the last sleep (now, while ongoing)
  ongoing: boolean;
  sleep: number; // sum of sleep inside the chain
  sessionIds: string[];
  complete: boolean; // false = partially tracked, excluded from stats
}

export interface Rhythm {
  onset: number | null; // bedtime of the first night once the rhythm is apparent
  nights: Night[]; // chronological; only nights from onset on
  nightSessionIds: Set<string>;
}

// Core window, local wall-clock hours of the morning after the night.
const CORE_START_H = 0;
const CORE_END_H = 5;
// Wakings whose midpoint lies in the deep night may be long (feeds); gaps at
// the edges of the night must be short or the sleep was a separate nap.
const DEEP_START_H = 23;
const DEEP_END_H = 6;
const DEEP_GAP_MS = 2 * HOUR_MS;
const EDGE_GAP_MS = 30 * MIN_MS;
const MAX_SPAN_MS = 16 * HOUR_MS;
// A night counts towards the onset when it's long and mostly asleep.
const ONSET_MIN_SPAN_MS = 8 * HOUR_MS;
const ONSET_MIN_SLEEP_RATIO = 0.75;
// ...and clearly sleepier than the 12 hours before it: a baby asleep around
// the clock has long, dense "nights" too.
const ONSET_CONTRAST_WINDOW_MS = 12 * HOUR_MS;
const ONSET_MIN_CONTRAST = 0.15;
const ONSET_WINDOW = 7;
const ONSET_MIN_NIGHTS = 5;
// After the onset, anything shorter is a logging gap, not a night.
const COMPLETE_MIN_SPAN_MS = 6 * HOUR_MS;
// Tonight's sleep counts as night once it starts within this many minutes of
// the earliest usual bedtime (10th percentile of recent nights).
const RECENT_NIGHTS = 14;
const BEDTIME_SLACK_MINS = 45;
const EARLY_BEDTIME_MINS = 120;

const at = (ts: number, hour: number, dayOffset = 0): number => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour).getTime();
};

const isDeepGap = (gapStart: number, gapEnd: number): boolean => {
  const mid = new Date((gapStart + gapEnd) / 2);
  const h = mid.getHours() + mid.getMinutes() / 60;
  return h >= DEEP_START_H || h < DEEP_END_H;
};

const gapAllowed = (gapStart: number, gapEnd: number): boolean => {
  const gap = gapEnd - gapStart;
  if (gap <= EDGE_GAP_MS) return true;
  return gap <= DEEP_GAP_MS && isDeepGap(gapStart, gapEnd);
};

interface Span {
  s: Session;
  start: number;
  end: number;
}

const buildNight = (spans: Span[], seed: number): { first: number; last: number } => {
  let first = seed;
  let last = seed;
  while (first > 0) {
    const prev = spans[first - 1];
    if (spans[last].end - prev.start > MAX_SPAN_MS) break;
    if (!gapAllowed(prev.end, spans[first].start)) break;
    first--;
  }
  while (last < spans.length - 1) {
    const next = spans[last + 1];
    if (next.end - spans[first].start > MAX_SPAN_MS) break;
    if (!gapAllowed(spans[last].end, next.start)) break;
    last++;
  }
  return { first, last };
};

const toNight = (spans: Span[], seed: number): Night => {
  const { first, last } = buildNight(spans, seed);
  const chain = spans.slice(first, last + 1);
  return {
    start: chain[0].start,
    end: chain[chain.length - 1].end,
    ongoing: chain[chain.length - 1].s.end === null,
    sleep: chain.reduce((a, x) => a + (x.end - x.start), 0),
    sessionIds: chain.map((x) => x.s.id),
    complete: true,
  };
};

// Minutes after noon, so evening bedtimes and after-midnight ones compare
// on one axis (19:30 → 450, 00:30 → 750).
export const minsAfterNoon = (ts: number): number => {
  const d = new Date(ts);
  return (((d.getHours() - 12 + 24) % 24) * 60 + d.getMinutes());
};

export const minsAfterMidnight = (ts: number): number => {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
};

export const computeRhythm = (sessions: Session[], now: number = Date.now()): Rhythm => {
  const spans: Span[] = sessions
    .map((s) => ({ s, start: s.start, end: s.end ?? now }))
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start);
  if (!spans.length) return { onset: null, nights: [], nightSessionIds: new Set() };

  // One candidate per calendar evening, seeded on the following core window.
  const candidates: Night[] = [];
  let evening = at(spans[0].start, 0, -1);
  const lastEvening = at(now, 0);
  let cursor = 0;
  while (evening <= lastEvening) {
    const coreStart = at(evening, CORE_START_H, 1);
    const coreEnd = at(evening, CORE_END_H, 1);
    let seed = -1;
    let best = 0;
    while (cursor < spans.length && spans[cursor].end <= coreStart - MAX_SPAN_MS) cursor++;
    for (let i = cursor; i < spans.length && spans[i].start < coreEnd; i++) {
      const ov = Math.min(spans[i].end, coreEnd) - Math.max(spans[i].start, coreStart);
      if (ov > best) {
        best = ov;
        seed = i;
      }
    }
    if (seed >= 0) {
      const night = toNight(spans, seed);
      const prevNight = candidates[candidates.length - 1];
      // Two core windows can't share a session.
      if (!prevNight || !prevNight.sessionIds.includes(night.sessionIds[0])) candidates.push(night);
    }
    evening = at(evening, 0, 1);
  }

  const sleepBetween = (from: number, to: number): number =>
    spans.reduce((a, x) => a + Math.max(0, Math.min(x.end, to) - Math.max(x.start, from)), 0);
  const consolidated = (n: Night): boolean => {
    const span = n.end - n.start;
    const ratio = n.sleep / span;
    const before = sleepBetween(n.start - ONSET_CONTRAST_WINDOW_MS, n.start) / ONSET_CONTRAST_WINDOW_MS;
    return span >= ONSET_MIN_SPAN_MS && ratio >= ONSET_MIN_SLEEP_RATIO && ratio - before >= ONSET_MIN_CONTRAST;
  };

  // Onset: first consolidated night of the first calendar week-window in
  // which most nights are consolidated.
  let onset: number | null = null;
  for (const c of candidates) {
    if (!consolidated(c)) continue;
    const windowEnd = at(c.start, 0, ONSET_WINDOW);
    const inWindow = candidates.filter((x) => x.start >= c.start && x.start < windowEnd);
    if (inWindow.filter(consolidated).length >= ONSET_MIN_NIGHTS) {
      onset = c.start;
      break;
    }
  }
  if (onset === null) return { onset: null, nights: [], nightSessionIds: new Set() };

  const nights = candidates
    .filter((c) => c.start >= onset)
    .map((c) => ({ ...c, complete: c.ongoing || c.end - c.start >= COMPLETE_MIN_SPAN_MS }));

  // Tonight, until sleep reaches the core window, the night can't be seeded:
  // any sleep from the child's usual bedtime on is provisionally tonight's.
  const tonight = at(now, 0, new Date(now).getHours() < 12 ? -1 : 0);
  if (!nights.some((n) => n.start >= at(tonight, 12))) {
    const recent = nights.filter((n) => n.complete && !n.ongoing).slice(-RECENT_NIGHTS);
    if (recent.length) {
      const earliest = percentile(recent.map((n) => minsAfterNoon(n.start)), 10) - BEDTIME_SLACK_MINS;
      const after = Math.max(at(tonight, 12), nights.length ? nights[nights.length - 1].end : 0);
      // An early bedtime still shows: no recent nap lasted this long. The
      // floor keeps a long afternoon nap from passing as night.
      const nightIds = new Set(nights.flatMap((n) => n.sessionIds));
      const longestNap = Math.max(
        0,
        ...spans
          .filter((x) => x.start >= recent[0].start && x.s.end !== null && !nightIds.has(x.s.id))
          .map((x) => x.end - x.start),
      );
      const latest = (CORE_END_H + 12) * 60; // a sleep starting after the core is a morning nap
      const isNight = (x: Span) => {
        const m = minsAfterNoon(x.start);
        if (m >= latest) return false;
        if (m >= earliest) return true;
        return x.s.end === null && x.end - x.start > longestNap && m >= earliest - EARLY_BEDTIME_MINS;
      };
      // The latest such sleep: an earlier one may have been a catnap before
      // bed, and is pulled back in by the edge rule if it wasn't.
      let seed = -1;
      for (let i = spans.length - 1; i >= 0 && spans[i].start >= after; i--) {
        if (isNight(spans[i])) {
          seed = i;
          break;
        }
      }
      if (seed >= 0) {
        const night = toNight(spans, seed);
        // Bedtime false starts before the seed are pulled in by the edge
        // rule; never reach back into the day before `after`.
        if (night.start >= after) nights.push(night);
      }
    }
  }
  return {
    onset,
    nights,
    nightSessionIds: new Set(nights.flatMap((n) => n.sessionIds)),
  };
};

// ---- days ----

export interface Day {
  start: number; // morning wake: end of the previous night
  end: number; // bedtime: start of the next night (now while the day runs)
  ongoing: boolean;
  naps: Session[];
  napSleep: number;
  complete: boolean; // both edges tracked, so the day is usable for stats
}

// A day without a tracked night at either end can't be told apart from a
// forgotten night, so it never counts towards stats.
const MAX_DAY_MS = 20 * HOUR_MS;

export const computeDays = (rhythm: Rhythm, sessions: Session[], now: number = Date.now()): Day[] => {
  const { nights, nightSessionIds } = rhythm;
  const naps = sessions
    .filter((s) => !nightSessionIds.has(s.id))
    .sort((a, b) => a.start - b.start);
  const days: Day[] = [];
  for (let i = 0; i < nights.length; i++) {
    const prev = nights[i];
    if (prev.ongoing) break;
    const next = nights[i + 1];
    const end = next ? next.start : now;
    const own = naps.filter((s) => s.start >= prev.end && s.start < end);
    days.push({
      start: prev.end,
      end,
      ongoing: !next,
      naps: own,
      napSleep: own.reduce((a, s) => a + ((s.end ?? now) - s.start), 0),
      complete: !!next && prev.complete && end - prev.end <= MAX_DAY_MS,
    });
  }
  return days;
};

// ---- stats ----

export interface RhythmStats {
  nightSleep: number[]; // ms
  bedtime: number[]; // minutes after noon
  wake: number[]; // minutes after midnight
  napTotal: number[]; // ms per day
  napLength: number[]; // ms per nap
  napCount: number[]; // per day
}

// Finished, completely tracked nights and days that started within the last
// `windowDays` days.
export const computeRhythmStats = (
  rhythm: Rhythm,
  days: Day[],
  now: number = Date.now(),
  windowDays = 7,
): RhythmStats => {
  const from = addDays(now, -windowDays);
  const nights = rhythm.nights.filter((n) => n.complete && !n.ongoing && n.start >= from);
  const fullDays = days.filter((d) => d.complete && d.start >= from);
  return {
    nightSleep: nights.map((n) => n.sleep),
    bedtime: nights.map((n) => minsAfterNoon(n.start)),
    wake: nights.map((n) => minsAfterMidnight(n.end)),
    napTotal: fullDays.map((d) => d.napSleep),
    napLength: fullDays.flatMap((d) => d.naps.map((s) => (s.end ?? now) - s.start)),
    napCount: fullDays.map((d) => d.naps.length),
  };
};

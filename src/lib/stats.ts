// Statistics for the Trends screen, ported from the prototype's render():
// 7-day summary distributions, per-day history rows, and the sleep heatmap.
import type { DayBounds, Feeding, Session } from "./types";
import { DAY_MS, MIN_MS, dayKey } from "./time";

export const percentile = (arr: number[], p: number): number => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

export interface SummaryStat {
  label: string;
  values: number[]; // durations in ms; empty = no data
}

// Last-7-days summary:
// - nap durations & wake windows: window = [todayStart - 7d, now], each
//   completed session counted ONCE at full duration (no per-day clipping)
// - daily sleep/awake totals: the 7 complete days before today, clipped
export const computeSummary = (
  sessions: Session[],
  dayStart: number,
  todayStart: number,
): SummaryStat[] => {
  const winStart = todayStart - 7 * DAY_MS;
  const completedInWin = sessions
    .filter((s): s is Session & { end: number } => s.end !== null && s.end > winStart)
    .sort((a, b) => a.start - b.start);
  const napDurs = completedInWin.map((s) => s.end - s.start);

  const wakeWindows: number[] = [];
  const byDay = new Map<string, (Session & { end: number })[]>();
  for (const s of completedInWin) {
    const k = dayKey(s.start, dayStart);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }
  for (const list of byDay.values()) {
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].start - list[i - 1].end;
      if (gap > 0) wakeWindows.push(gap);
    }
  }

  const dayTotals: number[] = [];
  const dayAwakeTotals: number[] = [];
  for (let i = 1; i <= 7; i++) {
    const b = { start: todayStart - i * DAY_MS, end: todayStart - (i - 1) * DAY_MS };
    let dt = 0;
    for (const s of sessions) {
      if (s.end === null) continue;
      const dur = Math.min(s.end, b.end) - Math.max(s.start, b.start);
      if (dur > 0) dt += dur;
    }
    if (dt > 0) {
      dayTotals.push(dt);
      dayAwakeTotals.push(Math.max(0, DAY_MS - dt));
    }
  }

  return [
    { label: "Avg nap length", values: napDurs },
    { label: "Avg daily sleep", values: dayTotals },
    { label: "Avg wake window", values: wakeWindows },
    { label: "Avg daily awake", values: dayAwakeTotals },
  ];
};

export interface HistoryDay {
  bounds: DayBounds;
  sessions: Session[];
  feedings: Feeding[];
  totalSleep: number; // clipped to the day (correct for totals)
  avgNap: number; // full durations of sessions STARTING that day (no double counting)
  napCount: number;
}

export const computeHistory = (
  sessions: Session[],
  feedings: Feeding[],
  todayStart: number,
  now: number,
  days = 7,
): HistoryDay[] => {
  const out: HistoryDay[] = [];
  for (let i = 1; i <= days; i++) {
    const b = { start: todayStart - i * DAY_MS, end: todayStart - (i - 1) * DAY_MS };
    const daySessions = sessions.filter((s) => (s.end ?? now) > b.start && s.start < b.end);
    const dayFeedings = feedings.filter((f) => f.ts >= b.start && f.ts < b.end);
    if (!daySessions.length && !dayFeedings.length) continue;
    let totalSleep = 0;
    for (const s of daySessions) {
      const dur = Math.min(s.end ?? now, b.end) - Math.max(s.start, b.start);
      if (dur > 0) totalSleep += dur;
    }
    const ownNaps = daySessions.filter(
      (s): s is Session & { end: number } => s.end !== null && s.start >= b.start && s.start < b.end,
    );
    const avgNap = ownNaps.length
      ? ownNaps.reduce((a, s) => a + (s.end - s.start), 0) / ownNaps.length
      : 0;
    out.push({ bounds: b, sessions: daySessions, feedings: dayFeedings, totalSleep, avgNap, napCount: ownNaps.length });
  }
  return out;
};

// ---- heatmap ----

export const SLOT_SIZES_MINS = [15, 30, 60, 120];

export interface HeatmapWeek {
  weekStart: number;
  sparse: boolean; // fewer than 3 tracked days
  cells: (number | null)[]; // asleep fraction 0..1 per slot; null = untracked
}

// Weeks are Monday+dayStart anchored so a 23:00-06:00 night doesn't straddle
// the day boundary. Today (incomplete) is excluded.
export const computeHeatmap = (
  sessions: Session[],
  slotMins: number,
  todayWeekStart: number,
  now: number,
  maxWeeks = 12,
): HeatmapWeek[] => {
  if (!sessions.length) return [];
  const slotMs = slotMins * MIN_MS;
  const slots = Math.round(1440 / slotMins);

  const weeks: { start: number; end: number }[] = [];
  let ws = todayWeekStart;
  const earliest = Math.min(...sessions.map((s) => s.start));
  for (let w = 0; w < maxWeeks; w++) {
    const we = ws + 7 * DAY_MS;
    if (sessions.some((s) => (s.end ?? now) > ws && s.start < we)) weeks.unshift({ start: ws, end: we });
    ws -= 7 * DAY_MS;
    if (ws + 7 * DAY_MS < earliest) break;
  }

  return weeks.map((week) => {
    const counts = new Array<number>(slots).fill(0);
    const trackedDays = new Array<number>(slots).fill(0);
    let dayCount = 0;
    for (let d = 0; d < 7; d++) {
      const ds = week.start + d * DAY_MS;
      if (ds + DAY_MS > now) continue; // skip incomplete (today)
      const segs = sessions.filter((s) => (s.end ?? now) > ds && s.start < ds + DAY_MS);
      if (!segs.length) continue;
      dayCount++;
      for (let sl = 0; sl < slots; sl++) {
        const ss = ds + sl * slotMs;
        const se = ss + slotMs;
        trackedDays[sl]++;
        if (segs.some((s) => s.start < se && (s.end ?? now) > ss)) counts[sl]++;
      }
    }
    return {
      weekStart: week.start,
      sparse: dayCount < 3,
      cells: counts.map((c, sl) => (trackedDays[sl] === 0 ? null : c / trackedDays[sl])),
    };
  });
};

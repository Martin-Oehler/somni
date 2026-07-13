// Sleep cycle projection, ported from the prototype: projects future naps
// from the most recent session using targetNap + cycle settings.
import type { DayBounds, Session, SharedSettings } from "./types";
import { MIN_MS, HOUR_MS } from "./time";

export interface Projection {
  start: number;
  end: number;
}

export const buildProjections = (
  sessions: Session[],
  settings: SharedSettings,
  bounds: DayBounds,
  now: number = Date.now(),
): Projection[] => {
  if (!sessions.length) return [];
  const last = [...sessions].sort((a, b) => b.start - a.start)[0];
  const napMs = settings.targetNapMins * MIN_MS; // clamped >=15m — loop always advances
  const cycleMs = settings.cycleTimeMins * MIN_MS;
  const awakeMs = Math.max(cycleMs - napMs, 0);
  const limit = Math.max(now + 24 * HOUR_MS, bounds.end);
  let nextStart =
    last.end === null ? Math.max(last.start + napMs, now) + awakeMs : last.end + awakeMs;
  const projs: Projection[] = [];
  while (nextStart < limit && projs.length < 64) {
    const nextEnd = nextStart + napMs;
    if (nextEnd > now) {
      const overlaps = sessions.some((s) => {
        const se = s.end ?? now;
        return nextStart < se && nextEnd > s.start;
      });
      if (!overlaps) projs.push({ start: nextStart, end: nextEnd });
    }
    nextStart = nextEnd + awakeMs;
  }
  return projs;
};

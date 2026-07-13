// Time math and formatting, ported from the prototype.
import type { DayBounds } from "./types";

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const MIN_MS = 60_000;

// An active session's effective end is capped for merging/warnings —
// a forgotten "still sleeping" can't swallow the whole day.
export const ACTIVE_CAP_MS = 12 * HOUR_MS;

export const fmtDur = (ms: number): string => {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / HOUR_MS);
  const m = Math.floor((ms % HOUR_MS) / MIN_MS);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const compactDur = (ms: number): string => fmtDur(ms).replace(/ /g, "");

export const fmtTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const fmtClock = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Local-time ISO string (YYYY-MM-DDTHH:mm) for datetime-local inputs.
export const toLocalISO = (ts: number): string => {
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * MIN_MS).toISOString().slice(0, 16);
};

export const nowMaxISO = (): string => toLocalISO(Date.now());

export const clampInt = (raw: unknown, min: number, max: number, fallback: number): number => {
  const v = parseInt(String(raw), 10);
  if (!Number.isFinite(v)) return fallback; // NOTE: not `|| fallback` — 0 is valid (dayStart midnight)
  return Math.min(max, Math.max(min, v));
};

// Note: "days" are dayStart-anchored and assumed 24h long; on DST-transition
// days boundaries drift by 1h. Accepted limitation (carried over from prototype).
export const dayKey = (ts: number, dayStartHour: number): string => {
  const d = new Date(ts - dayStartHour * HOUR_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const dayBounds = (key: string, dayStartHour: number): DayBounds => {
  const [y, mo, d] = key.split("-").map(Number);
  const start = new Date(y, mo - 1, d).getTime() + dayStartHour * HOUR_MS;
  return { start, end: start + DAY_MS };
};

export const boundsForDay = (ts: number, dayStartHour: number): DayBounds =>
  dayBounds(dayKey(ts, dayStartHour), dayStartHour);

// Monday-anchored start of the (dayStart-anchored) week containing ts.
export const weekStart = (ts: number, dayStartHour: number): number => {
  const { start } = boundsForDay(ts, dayStartHour);
  const wd = new Date(start).getDay();
  const diff = wd === 0 ? -6 : 1 - wd;
  return start + diff * DAY_MS;
};

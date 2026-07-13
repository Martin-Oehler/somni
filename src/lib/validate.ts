// Entry form validation, ported from the prototype. Returns an error
// message or null when valid.
import type { Session } from "./types";
import { fmtTime } from "./time";

export const validateSleep = (
  start: number | null,
  end: number | null,
  sessions: Session[],
  editId: string | null,
  now: number = Date.now(),
): string | null => {
  if (start === null) return "Please enter a start time.";
  const active = sessions.find((s) => s.end === null);
  if (start > now) return "Start must be in the past.";
  if (end !== null && end > now) return "End must be in the past.";
  if (end !== null && end <= start) return "End must be after start.";
  if (end === null && active && active.id !== editId) return "A sleep session is already active.";
  for (const s of sessions) {
    if (s.id === editId) continue;
    const sEnd = s.end ?? now;
    const nEnd = end ?? now;
    if (start < sEnd && nEnd > s.start) {
      return `Overlaps with session at ${fmtTime(s.start)}${s.end ? `–${fmtTime(s.end)}` : " (active)"}.`;
    }
  }
  return null;
};

export const validateFeed = (ts: number | null, now: number = Date.now()): string | null => {
  if (ts === null) return "Please enter a time.";
  if (ts > now) return "Must be in the past.";
  return null;
};

// Shared-settings shape: defaults, normalization (incl. legacy artifact
// fields), and the portable form used by export/import.
import { clampInt } from "./time";
import type { SharedSettings } from "./types";

export const DEFAULT_SETTINGS: SharedSettings = {
  targetNapMins: 180,
  cycleTimeMins: 240,
  dayStart: 6,
};

// Accepts anything (cloud row, localStorage, artifact export) and returns
// a partial of valid, clamped settings. Legacy artifact exports carried
// hours-based fields (targetNap/cycleTime) — still accepted.
export const normalizeSettings = (raw: unknown): Partial<SharedSettings> => {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<SharedSettings> = {};
  const napSrc = r.targetNapMins ?? (typeof r.targetNap === "number" ? Math.round(r.targetNap * 60) : null);
  const cycleSrc = r.cycleTimeMins ?? (typeof r.cycleTime === "number" ? Math.round(r.cycleTime * 60) : null);
  if (napSrc != null) out.targetNapMins = clampInt(napSrc, 15, 360, DEFAULT_SETTINGS.targetNapMins);
  if (cycleSrc != null) out.cycleTimeMins = clampInt(cycleSrc, 30, 720, DEFAULT_SETTINGS.cycleTimeMins);
  if (r.dayStart != null) out.dayStart = clampInt(r.dayStart, 0, 23, DEFAULT_SETTINGS.dayStart);
  return out;
};

// Portable settings shape for export (keeps legacy hours fields so old
// artifact builds could re-import a Somni export).
export const toPortableSettings = (s: SharedSettings): Record<string, number> => ({
  ...s,
  targetNap: s.targetNapMins / 60,
  cycleTime: s.cycleTimeMins / 60,
});

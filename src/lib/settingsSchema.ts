// Shared-settings shape: defaults, normalization (incl. legacy artifact
// fields), and the portable form used by export/import.
import { clampInt } from "./time";
import type { SharedSettings } from "./types";

export const DEFAULT_SETTINGS: SharedSettings = {
  targetNapMins: 180,
  cycleTimeMins: 240,
  dayStart: 6,
  birthdate: null,
  bedtimeMins: 1170, // 19:30
  strictness: 2,
  irregularDays: [],
};

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Keep only plausibly-recent irregular-day keys (trailing ~8 weeks). Uses
// string comparison — dayKeys are ISO dates, so lexicographic order works.
export const pruneIrregularDays = (days: string[], now: number = Date.now()): string[] => {
  const cutoff = new Date(now - 56 * 86_400_000);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  return [...new Set(days)].filter((d) => DAY_KEY_RE.test(d) && d >= cutoffKey).sort();
};

const normalizeBirthdate = (raw: unknown, now: number): string | null => {
  if (typeof raw !== "string" || !DAY_KEY_RE.test(raw)) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t) || t > now) return null;
  return raw;
};

// Accepts anything (cloud row, localStorage, artifact export) and returns
// a partial of valid, clamped settings. Legacy artifact exports carried
// hours-based fields (targetNap/cycleTime) — still accepted.
export const normalizeSettings = (raw: unknown, now: number = Date.now()): Partial<SharedSettings> => {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<SharedSettings> = {};
  const napSrc = r.targetNapMins ?? (typeof r.targetNap === "number" ? Math.round(r.targetNap * 60) : null);
  const cycleSrc = r.cycleTimeMins ?? (typeof r.cycleTime === "number" ? Math.round(r.cycleTime * 60) : null);
  if (napSrc != null) out.targetNapMins = clampInt(napSrc, 15, 360, DEFAULT_SETTINGS.targetNapMins);
  if (cycleSrc != null) out.cycleTimeMins = clampInt(cycleSrc, 30, 720, DEFAULT_SETTINGS.cycleTimeMins);
  if (r.dayStart != null) out.dayStart = clampInt(r.dayStart, 0, 23, DEFAULT_SETTINGS.dayStart);
  if ("birthdate" in r) out.birthdate = normalizeBirthdate(r.birthdate, now);
  if (r.bedtimeMins != null) out.bedtimeMins = clampInt(r.bedtimeMins, 960, 1380, DEFAULT_SETTINGS.bedtimeMins);
  if (r.strictness != null) out.strictness = clampInt(r.strictness, 0, 4, DEFAULT_SETTINGS.strictness);
  if (Array.isArray(r.irregularDays)) {
    out.irregularDays = pruneIrregularDays(r.irregularDays.filter((d): d is string => typeof d === "string"), now);
  }
  return out;
};

// Portable settings shape for export (keeps legacy hours fields so old
// artifact builds could re-import a Somni export).
export const toPortableSettings = (s: SharedSettings): Record<string, unknown> => ({
  ...s,
  targetNap: s.targetNapMins / 60,
  cycleTime: s.cycleTimeMins / 60,
});

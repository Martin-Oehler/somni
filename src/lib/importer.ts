// Import/export, format-compatible with the artifact prototype in both
// directions. Handles artifact v1 (raw-number feedings, id-less sessions)
// and v2 exports, strict validation (garbage can never wipe anything),
// tombstone respect, overlap collapse, feed dedupe, and deterministic
// re-keying of non-UUID ids to UUIDs (so two devices importing the same
// blob converge on identical ids).
import type { Feeding, Session, TrackerData } from "./types";

export const DATA_VERSION = 2;
export const FEED_DEDUPE_MS = 60_000;

// ---- migration of raw parsed JSON (artifact v1/v2 shapes) ----

type Tombstones = Record<string, number>;

const migrateSession = (s: unknown): Session | null => {
  if (!s || typeof s !== "object") return null;
  const r = s as Record<string, unknown>;
  if (!Number.isFinite(r.start)) return null;
  const start = r.start as number;
  const out: Session = {
    id: typeof r.id === "string" && r.id ? r.id : `s_${start}`,
    start,
    end: Number.isFinite(r.end) ? (r.end as number) : null,
  };
  if (Number.isFinite(r.settleMins)) {
    out.settleMins = Math.min(180, Math.max(0, Math.round(r.settleMins as number)));
  }
  return out;
};

const migrateFeeding = (f: unknown): Feeding | null => {
  if (typeof f === "number" && Number.isFinite(f)) return { id: `f_${f}`, ts: f };
  if (f && typeof f === "object") {
    const r = f as Record<string, unknown>;
    if (Number.isFinite(r.ts)) {
      const ts = r.ts as number;
      return { id: typeof r.id === "string" && r.id ? r.id : `f_${ts}`, ts };
    }
  }
  return null;
};

const migrateData = (raw: Record<string, unknown>): TrackerData => ({
  sessions: (Array.isArray(raw.sessions) ? raw.sessions : [])
    .map(migrateSession)
    .filter((s): s is Session => s !== null),
  feedings: (Array.isArray(raw.feedings) ? raw.feedings : [])
    .map(migrateFeeding)
    .filter((f): f is Feeding => f !== null),
});

// ---- strict import parsing ----

export type ParsedImport =
  | { ok: true; data: TrackerData; tombstones: Tombstones; settings: unknown }
  | { ok: false; error: string };

export const parseImport = (raw: string): ParsedImport => {
  let p: unknown;
  try {
    p = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  if (!p || typeof p !== "object") return { ok: false, error: "Not a data export." };
  const top = p as Record<string, unknown>;
  const src =
    "sessions" in top || "feedings" in top
      ? top
      : top.data && typeof top.data === "object"
        ? (top.data as Record<string, unknown>)
        : null;
  if (!src) return { ok: false, error: "No sessions/feedings found in this JSON." };
  const data = migrateData(src);
  if (!data.sessions.length && !data.feedings.length)
    return { ok: false, error: "Parsed, but it contains zero entries." };
  const tombstones =
    src.tombstones && typeof src.tombstones === "object" ? (src.tombstones as Tombstones) : {};
  return {
    ok: true,
    data,
    tombstones,
    settings: top.settings && typeof top.settings === "object" ? top.settings : null,
  };
};

// ---- deterministic sanitize (from the artifact's merge post-steps) ----

// Collapse overlapping/touching sessions. An active session's effective end
// is capped at start+12h so a forgotten "still sleeping" can't swallow later
// sessions. Deterministic: both devices converge on the same result.
export const collapseSessions = (sessions: Session[], now: number, capMs: number): Session[] => {
  const all = [...sessions].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  if (!all.length) return [];
  const effEnd = (s: Session) => s.end ?? Math.min(now, s.start + capMs);
  const merged: Session[] = [];
  let cur = { ...all[0] };
  for (let i = 1; i < all.length; i++) {
    const s = all[i];
    if (s.start <= effEnd(cur)) {
      if (cur.end === null || s.end === null) cur.end = null;
      else cur.end = Math.max(cur.end, s.end);
    } else {
      merged.push(cur);
      cur = { ...s };
    }
  }
  merged.push(cur);
  return merged;
};

// Drop feedings <60s apart (double-tap protection); deterministic order.
export const dedupeFeedings = (feedings: Feeding[]): Feeding[] => {
  const all = [...feedings].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  const out: Feeding[] = [];
  for (const f of all) {
    if (out.length && f.ts - out[out.length - 1].ts < FEED_DEDUPE_MS) continue;
    out.push(f);
  }
  return out;
};

// Union by id, current (local) wins on the same id.
export const mergeData = (current: TrackerData, imported: TrackerData): TrackerData => {
  const sById = new Map<string, Session>();
  for (const s of imported.sessions) sById.set(s.id, s);
  for (const s of current.sessions) sById.set(s.id, s);
  const fById = new Map<string, Feeding>();
  for (const f of imported.feedings) fById.set(f.id, f);
  for (const f of current.feedings) fById.set(f.id, f);
  return { sessions: [...sById.values()], feedings: [...fById.values()] };
};

// ---- deterministic UUID re-keying ----

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UUIDv5-style: SHA-1 of a fixed namespace + name, formatted as a UUID.
// Deterministic, so both devices re-key `s_<start>` ids identically.
export const deterministicUuid = async (name: string): Promise<string> => {
  const bytes = new TextEncoder().encode(`somni-import:${name}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const ensureUuid = async (id: string): Promise<string> =>
  UUID_RE.test(id) ? id.toLowerCase() : deterministicUuid(id);

// Applies tombstones, collapse/dedupe, and id re-keying to a parsed import.
export const sanitizeImport = async (
  data: TrackerData,
  tombstones: Tombstones,
  now: number = Date.now(),
  activeCapMs = 12 * 3_600_000,
): Promise<TrackerData> => {
  const live: TrackerData = {
    sessions: data.sessions.filter((s) => !tombstones[s.id]),
    feedings: data.feedings.filter((f) => !tombstones[f.id]),
  };
  const collapsed: TrackerData = {
    sessions: collapseSessions(live.sessions, now, activeCapMs),
    feedings: dedupeFeedings(live.feedings),
  };
  return {
    sessions: await Promise.all(
      collapsed.sessions.map(async (s) => ({ ...s, id: await ensureUuid(s.id) })),
    ),
    feedings: await Promise.all(
      collapsed.feedings.map(async (f) => ({ ...f, id: await ensureUuid(f.id) })),
    ),
  };
};

// ---- export ----

export const buildExport = (data: TrackerData, portableSettings: Record<string, unknown>): string =>
  JSON.stringify(
    {
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      data: { sessions: data.sessions, feedings: data.feedings, tombstones: {} },
      settings: portableSettings,
    },
    null,
    2,
  );

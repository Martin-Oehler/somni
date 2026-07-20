// The command layer: every user-facing mutation lives here and pairs a
// store change (instant UI) with an outbox op (eventual cloud write).
// Deletes are single-tap with a 5s UNDO snackbar.
import { snackbar } from "m3-svelte";
import { data } from "./stores/data.svelte";
import { settings } from "./stores/settings.svelte";
import { sync } from "./stores/sync.svelte";
import { outbox } from "./sync/outbox";
import { supabase } from "./sync/supabase";
import { saveLocalData, saveLocalSettings, saveColorScheme } from "./sync/local";
import { applyColorScheme } from "./theme";
import { buzz } from "./haptics";
import { fmtTime } from "./time";
import {
  FEED_DEDUPE_MS,
  collapseSessions,
  dedupeFeedings,
  mergeData,
  sanitizeImport,
  type ParsedImport,
} from "./importer";
import { normalizeSettings } from "./settingsSchema";
import type { ColorScheme, Feeding, Session, SharedSettings, TrackerData } from "./types";

const uid = (): string => crypto.randomUUID();

const persist = (): void => saveLocalData(data.snapshot);

const pushSession = (s: Session): void => {
  data.upsertSession(s);
  persist();
  outbox.enqueue({ op: "upsert", table: "sessions", rowId: s.id, row: { ...s } });
};

const pushFeeding = (f: Feeding): void => {
  data.upsertFeeding(f);
  persist();
  outbox.enqueue({ op: "upsert", table: "feedings", rowId: f.id, row: { ...f } });
};

// ---- primary actions ----

export const startSleep = (): void => {
  if (data.activeSession) return;
  buzz();
  pushSession({ id: uid(), start: Date.now(), end: null });
};

export const endSleep = (): void => {
  const active = data.activeSession;
  if (!active) return;
  buzz();
  pushSession({ ...active, end: Date.now() });
};

export const logFeedNow = (): void => {
  const now = Date.now();
  // Double-tap protection on the quick action (port of merge-time dedupe)
  if (data.feedings.some((f) => Math.abs(now - f.ts) < FEED_DEDUPE_MS)) {
    snackbar("Feed already logged just now");
    return;
  }
  buzz();
  pushFeeding({ id: uid(), ts: now });
};

// ---- manual entry / edit (validation happens in the sheet) ----

export const saveSleep = (
  start: number,
  end: number | null,
  editId: string | null,
  settleMins?: number | null,
): void => {
  if (editId) {
    const existing = data.sessions.find((s) => s.id === editId);
    if (!existing) return;
    pushSession({ ...existing, start, end, settleMins: settleMins ?? existing.settleMins ?? null });
  } else {
    pushSession({ id: uid(), start, end, settleMins: settleMins ?? null });
  }
};

// Settling-time annotation (SleepSheet chip row): strong latency evidence for
// the W(t) learner. null = "quick", the censored-normal default.
export const setSettleMins = (id: string, settleMins: number | null): void => {
  const existing = data.sessions.find((s) => s.id === id);
  if (!existing) return;
  pushSession({ ...existing, settleMins });
};

export const saveFeed = (ts: number, editId: string | null): void => {
  if (editId) {
    const existing = data.feedings.find((f) => f.id === editId);
    if (!existing) return;
    pushFeeding({ ...existing, ts });
  } else {
    pushFeeding({ id: uid(), ts });
  }
};

// ---- delete with undo ----

export const deleteSession = (id: string): void => {
  const removed = data.sessions.find((s) => s.id === id);
  if (!removed) return;
  data.removeSession(id);
  persist();
  outbox.enqueue({ op: "delete", table: "sessions", rowId: id, row: { ...removed } });
  snackbar(`Deleted sleep ${fmtTime(removed.start)}`, { UNDO: () => pushSession(removed) }, false, 5000);
};

export const deleteFeeding = (id: string): void => {
  const removed = data.feedings.find((f) => f.id === id);
  if (!removed) return;
  data.removeFeeding(id);
  persist();
  outbox.enqueue({ op: "delete", table: "feedings", rowId: id, row: { ...removed } });
  snackbar(`Deleted feed ${fmtTime(removed.ts)}`, { UNDO: () => pushFeeding(removed) }, false, 5000);
};

// ---- settings ----

export const updateSharedSettings = (patch: Partial<SharedSettings>): void => {
  settings.shared = { ...settings.shared, ...patch };
  saveLocalSettings(settings.shared);
  outbox.enqueue({ op: "upsert", table: "shared_settings", rowId: "1", row: { ...settings.shared } });
};

// Mark (or unmark) today as an irregular day — kept in the log but excluded
// from all rolling estimators, so a one-off disrupted day doesn't skew learning.
export const toggleIrregularToday = (dayKey: string): void => {
  const set = new Set(settings.shared.irregularDays);
  if (set.has(dayKey)) set.delete(dayKey);
  else set.add(dayKey);
  updateSharedSettings({ irregularDays: [...set].sort() });
};

export const updateColorScheme = (scheme: ColorScheme): void => {
  settings.colorScheme = scheme;
  saveColorScheme(scheme);
  applyColorScheme(scheme);
};

// ---- import (artifact migration + restore) ----

export interface ImportResult {
  sessions: number;
  feedings: number;
}

export const applyImport = async (
  parsed: ParsedImport & { ok: true },
  overwrite: boolean,
): Promise<ImportResult> => {
  const sanitized = await sanitizeImport(parsed.data, parsed.tombstones);

  // Don't resurrect entries already deleted in Somni (server tombstones).
  // Best-effort: offline import skips this check (migration usually happens
  // once, before any deletions exist).
  if (navigator.onLine) {
    try {
      const [ds, df] = await Promise.all([
        supabase.from("sessions").select("id").not("deleted_at", "is", null).limit(50000),
        supabase.from("feedings").select("id").not("deleted_at", "is", null).limit(50000),
      ]);
      const deadS = new Set((ds.data ?? []).map((r) => r.id));
      const deadF = new Set((df.data ?? []).map((r) => r.id));
      sanitized.sessions = sanitized.sessions.filter((s) => !deadS.has(s.id));
      sanitized.feedings = sanitized.feedings.filter((f) => !deadF.has(f.id));
    } catch {
      sync.logEvent("warn", "Import", "could not check server tombstones — proceeding");
    }
  }

  let target: TrackerData;
  if (overwrite) {
    target = sanitized;
  } else {
    const merged = mergeData(data.snapshot, sanitized);
    target = {
      sessions: collapseSessions(merged.sessions, Date.now(), 12 * 3_600_000),
      feedings: dedupeFeedings(merged.feedings),
    };
  }

  // Diff against the current store so only real changes hit the outbox.
  const currentS = new Map(data.sessions.map((s) => [s.id, s] as const));
  const currentF = new Map(data.feedings.map((f) => [f.id, f] as const));
  for (const s of target.sessions) {
    const cur = currentS.get(s.id);
    if (!cur || cur.start !== s.start || cur.end !== s.end) {
      outbox.enqueue({ op: "upsert", table: "sessions", rowId: s.id, row: { ...s } });
    }
  }
  for (const f of target.feedings) {
    const cur = currentF.get(f.id);
    if (!cur || cur.ts !== f.ts) {
      outbox.enqueue({ op: "upsert", table: "feedings", rowId: f.id, row: { ...f } });
    }
  }
  if (overwrite) {
    const targetS = new Set(target.sessions.map((s) => s.id));
    const targetF = new Set(target.feedings.map((f) => f.id));
    for (const s of data.sessions) {
      if (!targetS.has(s.id)) outbox.enqueue({ op: "delete", table: "sessions", rowId: s.id, row: { ...s } });
    }
    for (const f of data.feedings) {
      if (!targetF.has(f.id)) outbox.enqueue({ op: "delete", table: "feedings", rowId: f.id, row: { ...f } });
    }
  }

  data.replaceAll(target.sessions, target.feedings);
  persist();

  const importedSettings = normalizeSettings(parsed.settings);
  if (Object.keys(importedSettings).length) updateSharedSettings(importedSettings);

  sync.logEvent("ok", "Import applied", `${target.sessions.length} sessions, ${target.feedings.length} feedings (${overwrite ? "overwrite" : "merge"})`);
  return { sessions: target.sessions.length, feedings: target.feedings.length };
};

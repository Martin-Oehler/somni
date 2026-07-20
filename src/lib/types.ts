// The cross-layer contract: every module speaks these types.
// Timestamps are epoch milliseconds throughout the app (matching the
// prototype's domain logic); conversion to/from Postgres timestamptz
// happens only at the sync boundary (src/lib/sync/rows.ts).

export interface Session {
  id: string;
  start: number;
  end: number | null; // null = actively sleeping
  // How long the child took to settle into this sleep, in minutes.
  // null/undefined = not annotated (treated as a quick settle, censored ≤20).
  settleMins?: number | null;
}

export interface Feeding {
  id: string;
  ts: number;
}

export interface TrackerData {
  sessions: Session[];
  feedings: Feeding[];
}

export interface SharedSettings {
  // Legacy fixed-cycle fields: kept for back-compat with old exports and
  // un-updated devices, no longer surfaced in the UI.
  targetNapMins: number;
  cycleTimeMins: number;
  dayStart: number; // hour 0-23 the tracking day starts at
  birthdate: string | null; // "YYYY-MM-DD"; null = not set (neutral age prior)
  bedtimeMins: number; // bedtime target, minutes after midnight (local)
  strictness: number; // 0 (flexible) … 4 (strict) bedtime weighting
  irregularDays: string[]; // dayKeys excluded from learning, pruned to ~8 weeks
}

// A planned (not yet realized) block on the timeline.
export interface PlannedBlock {
  start: number;
  end: number;
  kind: "nap" | "bedtime";
}

export type ColorScheme = "system" | "light" | "dark";

export type EntryKind = "sleep" | "feed";

export interface DayBounds {
  start: number;
  end: number;
}

// ---- sync ----

export type TableName = "sessions" | "feedings" | "shared_settings";

export interface OutboxOp {
  seq: number;
  op: "upsert" | "delete"; // delete = upsert with deleted_at set (soft delete)
  table: TableName;
  // Domain shape of the row (Session / Feeding / SharedSettings);
  // mapped to the DB shape at flush time.
  row: Session | Feeding | SharedSettings;
  rowId: string; // entity id ("1" for shared_settings)
  queuedAt: number;
}

export type SyncStatus = "ok" | "pending" | "fail";

export type SyncLogLevel = "ok" | "warn" | "err" | "info";

export interface SyncLogEntry {
  ts: number;
  level: SyncLogLevel;
  type: string;
  details: string;
}

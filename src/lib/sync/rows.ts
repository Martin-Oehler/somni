// Domain <-> database row mapping. Epoch-ms in the app, timestamptz (ISO
// strings) in Postgres. updated_at is server-maintained (trigger) and never
// sent by the client.
import type { Feeding, Session, SharedSettings, TableName } from "../types";

export interface SessionRow {
  id: string;
  start_ts: string;
  end_ts: string | null;
  settle_mins: number | null;
  deleted_at: string | null;
}

export interface FeedingRow {
  id: string;
  ts: string;
  deleted_at: string | null;
}

export interface SharedSettingsRow {
  id: number;
  value: SharedSettings;
}

const iso = (ms: number) => new Date(ms).toISOString();

export const rowToSession = (r: {
  id: string;
  start_ts: string;
  end_ts: string | null;
  settle_mins?: number | null;
}): Session => ({
  id: r.id,
  start: Date.parse(r.start_ts),
  end: r.end_ts === null ? null : Date.parse(r.end_ts),
  settleMins: r.settle_mins ?? null,
});

export const rowToFeeding = (r: { id: string; ts: string }): Feeding => ({
  id: r.id,
  ts: Date.parse(r.ts),
});

export const toDbRow = (
  table: TableName,
  row: Session | Feeding | SharedSettings,
  deleted: boolean,
): SessionRow | FeedingRow | SharedSettingsRow => {
  const deleted_at = deleted ? iso(Date.now()) : null;
  if (table === "sessions") {
    const s = row as Session;
    return {
      id: s.id,
      start_ts: iso(s.start),
      end_ts: s.end === null ? null : iso(s.end),
      settle_mins: s.settleMins ?? null,
      deleted_at,
    };
  }
  if (table === "feedings") {
    const f = row as Feeding;
    return { id: f.id, ts: iso(f.ts), deleted_at };
  }
  return { id: 1, value: row as SharedSettings };
};

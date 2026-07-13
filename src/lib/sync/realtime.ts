// Supabase Realtime: row changes from the other device push into the
// store instantly — this is the event-driven sync that replaces the
// prototype's 30s polling.
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { rowToFeeding, rowToSession } from "./rows";
import type { FeedingRow, SessionRow, SharedSettingsRow } from "./rows";
import { data } from "../stores/data.svelte";
import { settings } from "../stores/settings.svelte";
import { sync } from "../stores/sync.svelte";
import { outbox } from "./outbox";
import { saveLocalData, saveLocalSettings } from "./local";
import { normalizeSettings } from "../settingsSchema";

const handleSession = (p: RealtimePostgresChangesPayload<SessionRow>): void => {
  if (p.eventType === "DELETE") return; // rows are soft-deleted, never removed
  const row = p.new;
  // A pending local op for this row wins until it has been flushed.
  if (outbox.hasPending("sessions", row.id)) return;
  if (row.deleted_at) {
    data.removeSession(row.id);
    sync.logEvent("info", "Remote delete", `session ${row.id}`);
  } else {
    data.upsertSession(rowToSession(row));
    sync.logEvent("info", "Remote update", `session ${row.id}`);
  }
  saveLocalData(data.snapshot);
};

const handleFeeding = (p: RealtimePostgresChangesPayload<FeedingRow>): void => {
  if (p.eventType === "DELETE") return;
  const row = p.new;
  if (outbox.hasPending("feedings", row.id)) return;
  if (row.deleted_at) {
    data.removeFeeding(row.id);
    sync.logEvent("info", "Remote delete", `feeding ${row.id}`);
  } else {
    data.upsertFeeding(rowToFeeding(row));
    sync.logEvent("info", "Remote update", `feeding ${row.id}`);
  }
  saveLocalData(data.snapshot);
};

const handleSettings = (p: RealtimePostgresChangesPayload<SharedSettingsRow>): void => {
  if (p.eventType === "DELETE") return;
  if (outbox.hasPending("shared_settings", "1")) return;
  settings.shared = { ...settings.shared, ...normalizeSettings(p.new.value) };
  saveLocalSettings(settings.shared);
  sync.logEvent("info", "Remote update", "shared settings");
};

export const startRealtime = (): void => {
  supabase
    .channel("somni-db")
    .on<SessionRow>(
      "postgres_changes",
      { event: "*", schema: "public", table: "sessions" },
      handleSession,
    )
    .on<FeedingRow>(
      "postgres_changes",
      { event: "*", schema: "public", table: "feedings" },
      handleFeeding,
    )
    .on<SharedSettingsRow>(
      "postgres_changes",
      { event: "*", schema: "public", table: "shared_settings" },
      handleSettings,
    )
    .subscribe((status) => {
      const connected = status === "SUBSCRIBED";
      if (connected !== sync.realtimeConnected) {
        sync.realtimeConnected = connected;
        sync.logEvent(connected ? "ok" : "warn", `Realtime ${connected ? "connected" : status.toLowerCase()}`);
      }
    });
};

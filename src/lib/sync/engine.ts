// Sync orchestration: boot from local cache instantly, then reconcile
// with the server (full pull + pending-op overlay + last-write-wins),
// and keep listening — realtime push, reconnect, tab-visible, plus a slow
// interval as a safety net under realtime.
import { supabase } from "./supabase";
import { outbox } from "./outbox";
import { startRealtime } from "./realtime";
import { rowToFeeding, rowToSession } from "./rows";
import { loadLocalData, loadLocalSettings, saveLocalData, saveLocalSettings } from "./local";
import { data } from "../stores/data.svelte";
import { settings } from "../stores/settings.svelte";
import { sync } from "../stores/sync.svelte";
import { normalizeSettings } from "../settingsSchema";
import type { Feeding, Session, SharedSettings } from "../types";

const RETRY_INTERVAL_MS = 15_000; // when the outbox is non-empty or a write failed
const IDLE_RECONCILE_MS = 120_000; // safety net under realtime

let reconciling = false;

export const bootFromCache = (): void => {
  const local = loadLocalData();
  data.replaceAll(local.sessions, local.feedings);
  settings.shared = loadLocalSettings();
  outbox.init();
};

export const reconcile = async (reason: string): Promise<void> => {
  if (reconciling || !navigator.onLine) return;
  reconciling = true;
  sync.lastAttempt = Date.now();
  try {
    const [sess, feeds, sharedRow] = await Promise.all([
      supabase.from("sessions").select("id,start_ts,end_ts,settle_mins").is("deleted_at", null).limit(50000),
      supabase.from("feedings").select("id,ts").is("deleted_at", null).limit(50000),
      supabase.from("shared_settings").select("value").eq("id", 1).maybeSingle(),
    ]);
    if (sess.error || feeds.error || sharedRow.error) {
      const msg = (sess.error ?? feeds.error ?? sharedRow.error)!.message;
      sync.status = "fail";
      sync.attemptsSinceSuccess++;
      sync.logEvent("err", `Sync failed (${reason})`, msg);
      return;
    }

    // Server state + pending local ops overlaid (local wins its own rows).
    const sessions = new Map<string, Session>(
      (sess.data ?? []).map((r) => [r.id, rowToSession(r)] as const),
    );
    for (const op of outbox.opsFor("sessions")) {
      if (op.op === "delete") sessions.delete(op.rowId);
      else sessions.set(op.rowId, op.row as Session);
    }
    const feedings = new Map<string, Feeding>(
      (feeds.data ?? []).map((r) => [r.id, rowToFeeding(r)] as const),
    );
    for (const op of outbox.opsFor("feedings")) {
      if (op.op === "delete") feedings.delete(op.rowId);
      else feedings.set(op.rowId, op.row as Feeding);
    }
    data.replaceAll([...sessions.values()], [...feedings.values()]);
    saveLocalData(data.snapshot);

    if (sharedRow.data && !outbox.hasPending("shared_settings", "1")) {
      settings.shared = { ...settings.shared, ...normalizeSettings(sharedRow.data.value) };
      saveLocalSettings(settings.shared);
    } else if (!sharedRow.data) {
      // First boot against an empty project: seed the shared settings row.
      outbox.enqueue({
        op: "upsert",
        table: "shared_settings",
        rowId: "1",
        row: { ...settings.shared } as SharedSettings,
      });
    }

    sync.lastSuccess = Date.now();
    sync.attemptsSinceSuccess = 0;
    if (!outbox.depth) sync.status = "ok";
    sync.logEvent("ok", `Synced (${reason})`, `${sessions.size} sessions, ${feedings.size} feedings`);
  } finally {
    reconciling = false;
  }
  await outbox.flush();
};

export const startSync = (): void => {
  startRealtime();

  window.addEventListener("online", () => {
    sync.online = true;
    sync.logEvent("info", "Back online");
    void reconcile("reconnect");
  });
  window.addEventListener("offline", () => {
    sync.online = false;
    if (outbox.depth) sync.status = "pending";
    sync.logEvent("warn", "Offline", "changes queue locally");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void reconcile("visible");
  });

  setInterval(() => {
    if (outbox.depth > 0 || sync.status === "fail") void outbox.flush();
  }, RETRY_INTERVAL_MS);
  setInterval(() => void reconcile("scheduled"), IDLE_RECONCILE_MS);

  void reconcile("startup");
};

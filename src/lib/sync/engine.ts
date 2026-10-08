// Sync orchestration: boot from local cache instantly, then reconcile
// with the server (full pull + pending-op overlay + last-write-wins),
// and keep listening — realtime push, reconnect, tab-visible, plus a slow
// interval as a safety net under realtime.
import { supabase } from "./supabase";
import { outbox } from "./outbox";
import { startRealtime } from "./realtime";
import { rowToFeeding, rowToSession } from "./rows";
import { fetchAllRows } from "./paginate";
import { mergePull } from "./merge";
import { loadLocalData, loadLocalSettings, saveLocalData, saveLocalSettings } from "./local";
import { data } from "../stores/data.svelte";
import { settings } from "../stores/settings.svelte";
import { sync } from "../stores/sync.svelte";
import { normalizeSettings } from "../settingsSchema";
import type { Feeding, Session, SharedSettings } from "../types";

const RETRY_INTERVAL_MS = 15_000; // when the outbox is non-empty, a write failed, or a pull failed
const IDLE_RECONCILE_MS = 120_000; // safety net under realtime
// Pull failures are usually transient (a dropped connection on resume, a
// flaky mobile network) and an immediate retry tends to succeed, so retry
// a few times quickly before surfacing "Sync failed".
const PULL_RETRY_DELAYS_MS = [300, 700, 1_500, 3_000];

let reconciling = false;
let lastPullFailed = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pullServerState = async () => {
  // Paged reads — a single select is capped at db.max_rows (1000) and would
  // silently drop everything past it, wiping those rows from the store below.
  const [sess, feeds, sharedRow] = await Promise.all([
    fetchAllRows<{ id: string; start_ts: string; end_ts: string | null }>(
      "sessions",
      "id,start_ts,end_ts",
      "live",
    ),
    fetchAllRows<{ id: string; ts: string }>("feedings", "id,ts", "live"),
    supabase.from("shared_settings").select("value").eq("id", 1).maybeSingle(),
  ]);
  const error = sess.error ?? feeds.error ?? sharedRow.error?.message ?? null;
  return { sess, feeds, sharedRow, error };
};

const pullWithRetry = async (reason: string) => {
  for (let attempt = 0; ; attempt++) {
    let pulled: Awaited<ReturnType<typeof pullServerState>>;
    try {
      pulled = await pullServerState();
    } catch (e) {
      pulled = { error: e instanceof Error ? e.message : String(e) } as typeof pulled;
    }
    if (!pulled.error || attempt >= PULL_RETRY_DELAYS_MS.length || !navigator.onLine) return pulled;
    sync.logEvent("warn", `Sync retry ${attempt + 1} (${reason})`, pulled.error);
    await sleep(PULL_RETRY_DELAYS_MS[attempt]);
  }
};

export const bootFromCache = (): void => {
  const local = loadLocalData();
  data.replaceAll(local.sessions, local.feedings);
  settings.shared = loadLocalSettings();
  outbox.init();
};

export const reconcile = async (reason: string): Promise<void> => {
  if (reconciling || !navigator.onLine) return;
  reconciling = true;
  sync.pulling = true;
  sync.lastAttempt = Date.now();
  // The pull below is a snapshot from when it was requested; anything that
  // changes the store before it lands (a nap started mid-sync, a realtime
  // push) is newer and must survive the merge.
  data.trackChanges();
  const settingsAtStart = settings.shared;
  try {
    const { sess, feeds, sharedRow, error } = await pullWithRetry(reason);
    lastPullFailed = !!error;
    if (error) {
      sync.status = "fail";
      sync.attemptsSinceSuccess++;
      sync.logEvent("err", `Sync failed (${reason})`, error);
      return;
    }

    // Server state, overlaid by pending local ops and mid-pull changes.
    const touched = data.takeChanges();
    const sessions = mergePull<Session>(
      sess.rows.map(rowToSession),
      outbox.opsFor("sessions"),
      touched.sessions,
      data.sessions,
    );
    const feedings = mergePull<Feeding>(
      feeds.rows.map(rowToFeeding),
      outbox.opsFor("feedings"),
      touched.feedings,
      data.feedings,
    );
    data.replaceAll(sessions, feedings);
    saveLocalData(data.snapshot);

    const settingsChanged = settings.shared !== settingsAtStart;
    if (sharedRow.data && !settingsChanged && !outbox.hasPending("shared_settings", "1")) {
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
    sync.logEvent("ok", `Synced (${reason})`, `${sessions.length} sessions, ${feedings.length} feedings`);
  } finally {
    data.takeChanges(); // stop tracking on the error path too
    reconciling = false;
    sync.pulling = false;
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
    // A failed pull would otherwise wait for the slow idle reconcile.
    if (lastPullFailed) void reconcile("retry");
    else if (outbox.depth > 0 || sync.status === "fail") void outbox.flush();
  }, RETRY_INTERVAL_MS);
  setInterval(() => void reconcile("scheduled"), IDLE_RECONCILE_MS);

  void reconcile("startup");
};

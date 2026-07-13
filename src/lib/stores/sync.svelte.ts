// Sync status surface: drives the header cloud icon, the sync detail
// sheet, and the event log (in-memory ring buffer, resets on reload).
import type { SyncLogEntry, SyncLogLevel, SyncStatus } from "../types";

const SYNC_LOG_MAX = 200;

class SyncStore {
  status = $state<SyncStatus>("ok");
  online = $state(typeof navigator === "undefined" ? true : navigator.onLine);
  realtimeConnected = $state(false);
  outboxDepth = $state(0);
  lastAttempt = $state<number | null>(null);
  lastSuccess = $state<number | null>(null);
  attemptsSinceSuccess = $state(0);
  log = $state<SyncLogEntry[]>([]);

  logEvent(level: SyncLogLevel, type: string, details = ""): void {
    this.log = [{ ts: Date.now(), level, type, details }, ...this.log].slice(0, SYNC_LOG_MAX);
  }

  clearLog(): void {
    this.log = [];
  }
}

export const sync = new SyncStore();

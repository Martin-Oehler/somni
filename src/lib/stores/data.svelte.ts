// Reactive tracker data. State only — mutations that must reach the cloud
// go through src/lib/actions.ts, which pairs store changes with outbox ops.
import type { Feeding, Session, TrackerData } from "../types";

export interface TouchedIds {
  sessions: Set<string>;
  feedings: Set<string>;
}

class DataStore {
  sessions = $state<Session[]>([]);
  feedings = $state<Feeding[]>([]);

  // Ids changed while a server pull is in flight (local actions and realtime
  // alike) — reconcile keeps the store's state for these over the pull's
  // older snapshot. Plain field: bookkeeping, not UI state.
  private touched: TouchedIds | null = null;

  trackChanges(): void {
    this.touched = { sessions: new Set(), feedings: new Set() };
  }

  takeChanges(): TouchedIds {
    const t = this.touched ?? { sessions: new Set<string>(), feedings: new Set<string>() };
    this.touched = null;
    return t;
  }

  get activeSession(): Session | null {
    return this.sessions.find((s) => s.end === null) ?? null;
  }

  get snapshot(): TrackerData {
    return { sessions: this.sessions, feedings: this.feedings };
  }

  replaceAll(sessions: Session[], feedings: Feeding[]): void {
    if (this.touched) {
      for (const s of [...this.sessions, ...sessions]) this.touched.sessions.add(s.id);
      for (const f of [...this.feedings, ...feedings]) this.touched.feedings.add(f.id);
    }
    this.sessions = [...sessions].sort((a, b) => a.start - b.start);
    this.feedings = [...feedings].sort((a, b) => a.ts - b.ts);
  }

  upsertSession(s: Session): void {
    this.touched?.sessions.add(s.id);
    const next = this.sessions.filter((x) => x.id !== s.id);
    next.push({ ...s });
    next.sort((a, b) => a.start - b.start);
    this.sessions = next;
  }

  removeSession(id: string): void {
    this.touched?.sessions.add(id);
    this.sessions = this.sessions.filter((x) => x.id !== id);
  }

  upsertFeeding(f: Feeding): void {
    this.touched?.feedings.add(f.id);
    const next = this.feedings.filter((x) => x.id !== f.id);
    next.push({ ...f });
    next.sort((a, b) => a.ts - b.ts);
    this.feedings = next;
  }

  removeFeeding(id: string): void {
    this.touched?.feedings.add(id);
    this.feedings = this.feedings.filter((x) => x.id !== id);
  }
}

export const data = new DataStore();

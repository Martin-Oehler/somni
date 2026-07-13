// Reactive tracker data. State only — mutations that must reach the cloud
// go through src/lib/actions.ts, which pairs store changes with outbox ops.
import type { Feeding, Session, TrackerData } from "../types";

class DataStore {
  sessions = $state<Session[]>([]);
  feedings = $state<Feeding[]>([]);

  get activeSession(): Session | null {
    return this.sessions.find((s) => s.end === null) ?? null;
  }

  get snapshot(): TrackerData {
    return { sessions: this.sessions, feedings: this.feedings };
  }

  replaceAll(sessions: Session[], feedings: Feeding[]): void {
    this.sessions = [...sessions].sort((a, b) => a.start - b.start);
    this.feedings = [...feedings].sort((a, b) => a.ts - b.ts);
  }

  upsertSession(s: Session): void {
    const next = this.sessions.filter((x) => x.id !== s.id);
    next.push({ ...s });
    next.sort((a, b) => a.start - b.start);
    this.sessions = next;
  }

  removeSession(id: string): void {
    this.sessions = this.sessions.filter((x) => x.id !== id);
  }

  upsertFeeding(f: Feeding): void {
    const next = this.feedings.filter((x) => x.id !== f.id);
    next.push({ ...f });
    next.sort((a, b) => a.ts - b.ts);
    this.feedings = next;
  }

  removeFeeding(id: string): void {
    this.feedings = this.feedings.filter((x) => x.id !== id);
  }
}

export const data = new DataStore();

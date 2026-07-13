// The offline outbox: every data change enqueues a row op here. A single
// promise chain serializes flushes (no interleaved writes, no lost
// updates) — the direct descendant of the prototype's write queue.
// Deletes are soft: an upsert with deleted_at set, so one code path
// covers rows that never reached the server.
import type { OutboxOp, TableName } from "../types";
import { supabase } from "./supabase";
import { toDbRow } from "./rows";
import { loadOutbox, saveOutbox } from "./local";
import { sync } from "../stores/sync.svelte";

class Outbox {
  private ops: OutboxOp[] = [];
  private chain: Promise<void> = Promise.resolve();
  private seq = 1;

  init(): void {
    this.ops = loadOutbox();
    this.seq = this.ops.reduce((m, o) => Math.max(m, o.seq), 0) + 1;
    sync.outboxDepth = this.ops.length;
    if (this.ops.length) sync.status = "pending";
  }

  get depth(): number {
    return this.ops.length;
  }

  hasPending(table: TableName, rowId: string): boolean {
    return this.ops.some((o) => o.table === table && o.rowId === rowId);
  }

  // Pending ops overlay the server state during reconcile: local changes
  // win for their own rows until they have been flushed.
  opsFor(table: TableName): OutboxOp[] {
    return this.ops.filter((o) => o.table === table);
  }

  enqueue(op: Omit<OutboxOp, "seq" | "queuedAt">): void {
    // Coalesce: only the latest state of an entity matters (entities are
    // independent, so reordering across ids is safe).
    this.ops = this.ops.filter((o) => !(o.table === op.table && o.rowId === op.rowId));
    this.ops.push({ ...op, seq: this.seq++, queuedAt: Date.now() });
    this.persist();
    sync.status = "pending";
    void this.flush();
  }

  private persist(): void {
    saveOutbox(this.ops);
    sync.outboxDepth = this.ops.length;
  }

  flush(): Promise<void> {
    this.chain = this.chain.then(() => this.flushInner()).catch(() => {});
    return this.chain;
  }

  private async flushInner(): Promise<void> {
    if (!this.ops.length) return;
    if (!navigator.onLine) {
      sync.status = "pending";
      return;
    }
    while (this.ops.length) {
      const op = this.ops[0];
      sync.lastAttempt = Date.now();
      sync.attemptsSinceSuccess++;
      const row = toDbRow(op.table, op.row, op.op === "delete");
      // Untyped client + dynamic table name: the row shape is guaranteed by toDbRow.
      const { error } = await supabase.from(op.table).upsert(row as never);
      if (error) {
        sync.status = navigator.onLine ? "fail" : "pending";
        sync.logEvent("err", `Write failed (${op.table})`, `${op.op} ${op.rowId} — ${error.message}`);
        return; // keep the op; scheduler/reconnect retries
      }
      this.ops.shift();
      this.persist();
      sync.lastSuccess = Date.now();
      sync.attemptsSinceSuccess = 0;
      sync.logEvent("ok", `Write ok (${op.table})`, `${op.op} ${op.rowId}`);
    }
    sync.status = "ok";
  }
}

export const outbox = new Outbox();

// Merging a server pull into the store. Pure, so the race it guards
// against is unit-testable without a backend.
import type { OutboxOp } from "../types";

// The pull is a snapshot taken when the request went out, so on its own it
// can be older than the store. Precedence, lowest to highest:
//   1. server rows
//   2. pending outbox ops (local wins its own rows until flushed)
//   3. rows touched in the store while the pull was in flight — a local
//      write that flushed mid-pull is no longer in the outbox but also not
//      in the snapshot, and a realtime push may be newer than the snapshot;
//      for these the current store state (present or absent) is the truth.
export const mergePull = <T extends { id: string }>(
  serverRows: T[],
  pendingOps: OutboxOp[],
  touched: ReadonlySet<string>,
  current: T[],
): T[] => {
  const rows = new Map<string, T>(serverRows.map((r) => [r.id, r] as const));
  for (const op of pendingOps) {
    if (op.op === "delete") rows.delete(op.rowId);
    else rows.set(op.rowId, op.row as unknown as T);
  }
  const now = new Map<string, T>(current.map((r) => [r.id, r] as const));
  for (const id of touched) {
    const row = now.get(id);
    if (row) rows.set(id, row);
    else rows.delete(id);
  }
  return [...rows.values()];
};

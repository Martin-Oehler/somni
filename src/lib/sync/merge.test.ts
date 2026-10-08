import { describe, expect, it } from "vitest";
import { mergePull } from "./merge";
import type { OutboxOp, Session } from "../types";

const s = (id: string, start: number, end: number | null = start + 1): Session => ({ id, start, end });
const op = (o: "upsert" | "delete", row: Session): OutboxOp => ({
  seq: 1,
  op: o,
  table: "sessions",
  row,
  rowId: row.id,
  queuedAt: 0,
});
const byId = (rows: Session[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

describe("mergePull", () => {
  it("takes the server state when nothing happened locally", () => {
    const server = [s("a", 1), s("b", 2)];
    expect(byId(mergePull(server, [], new Set(), [s("a", 1)]))).toEqual(server);
  });

  it("overlays pending outbox ops", () => {
    const server = [s("a", 1), s("b", 2)];
    const merged = mergePull(server, [op("upsert", s("a", 5)), op("delete", s("b", 2)), op("upsert", s("c", 3))], new Set(), []);
    expect(byId(merged)).toEqual([s("a", 5), s("c", 3)]);
  });

  it("keeps a sleep started and flushed while the pull was in flight", () => {
    // The pull's snapshot predates the nap; the outbox already flushed it.
    const active = s("nap", 10, null);
    const merged = mergePull([s("a", 1)], [], new Set(["nap"]), [s("a", 1), active]);
    expect(byId(merged)).toEqual([s("a", 1), active]);
  });

  it("keeps a row removed from the store while the pull was in flight", () => {
    const merged = mergePull([s("a", 1), s("b", 2)], [], new Set(["b"]), [s("a", 1)]);
    expect(byId(merged)).toEqual([s("a", 1)]);
  });

  it("prefers a mid-pull store change over a stale server row", () => {
    const merged = mergePull([s("a", 1, null)], [], new Set(["a"]), [s("a", 1, 9)]);
    expect(merged).toEqual([s("a", 1, 9)]);
  });
});

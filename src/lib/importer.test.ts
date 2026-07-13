import { describe, expect, it } from "vitest";
import {
  buildExport,
  collapseSessions,
  dedupeFeedings,
  deterministicUuid,
  ensureUuid,
  mergeData,
  parseImport,
  sanitizeImport,
} from "./importer";
import { normalizeSettings } from "./settingsSchema";
import { HOUR_MS, MIN_MS } from "./time";

const NOW = new Date(2026, 6, 10, 12, 0).getTime();

describe("parseImport", () => {
  it("rejects garbage", () => {
    expect(parseImport("not json")).toEqual({ ok: false, error: "Not valid JSON." });
    expect(parseImport('"str"').ok).toBe(false);
    expect(parseImport('{"foo": 1}').ok).toBe(false);
    expect(parseImport('{"sessions": [], "feedings": []}').ok).toBe(false); // zero entries
  });

  it("parses an artifact v2 export (nested data)", () => {
    const raw = JSON.stringify({
      version: 2,
      exportedAt: "2026-07-01T00:00:00Z",
      data: {
        sessions: [{ id: "abc", start: 100, end: 200 }],
        feedings: [{ id: "def", ts: 150 }],
        tombstones: { gone: 123 },
      },
      settings: { targetNapMins: 120 },
    });
    const p = parseImport(raw);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.data.sessions).toEqual([{ id: "abc", start: 100, end: 200 }]);
    expect(p.data.feedings).toEqual([{ id: "def", ts: 150 }]);
    expect(p.tombstones).toEqual({ gone: 123 });
  });

  it("migrates artifact v1 shapes (numeric feedings, id-less sessions)", () => {
    const p = parseImport(JSON.stringify({ sessions: [{ start: 100, end: 200 }], feedings: [150] }));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.data.sessions[0].id).toBe("s_100");
    expect(p.data.feedings[0]).toEqual({ id: "f_150", ts: 150 });
  });
});

describe("collapseSessions", () => {
  it("collapses overlapping/touching sessions", () => {
    const a = { id: "a", start: NOW - 3 * HOUR_MS, end: NOW - 2 * HOUR_MS };
    const b = { id: "b", start: NOW - 2 * HOUR_MS - 10 * MIN_MS, end: NOW - HOUR_MS };
    const out = collapseSessions([b, a], NOW, 12 * HOUR_MS);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a"); // keeps the earlier session's id
    expect(out[0].end).toBe(b.end);
  });
  it("stays active if either overlapping session is active", () => {
    const a = { id: "a", start: NOW - 2 * HOUR_MS, end: null };
    const b = { id: "b", start: NOW - HOUR_MS, end: NOW - 30 * MIN_MS };
    const out = collapseSessions([a, b], NOW, 12 * HOUR_MS);
    expect(out).toHaveLength(1);
    expect(out[0].end).toBeNull();
  });
  it("caps a forgotten active session so it can't swallow later ones", () => {
    const forgotten = { id: "a", start: NOW - 20 * HOUR_MS, end: null };
    const later = { id: "b", start: NOW - 2 * HOUR_MS, end: NOW - HOUR_MS };
    const out = collapseSessions([forgotten, later], NOW, 12 * HOUR_MS);
    expect(out).toHaveLength(2);
  });
});

describe("dedupeFeedings", () => {
  it("drops feedings under 60s apart", () => {
    const out = dedupeFeedings([
      { id: "a", ts: NOW },
      { id: "b", ts: NOW + 30_000 },
      { id: "c", ts: NOW + 90_000 },
    ]);
    expect(out.map((f) => f.id)).toEqual(["a", "c"]);
  });
});

describe("mergeData", () => {
  it("unions by id with current winning", () => {
    const current = {
      sessions: [{ id: "x", start: 1, end: 2 }],
      feedings: [{ id: "f", ts: 5 }],
    };
    const imported = {
      sessions: [{ id: "x", start: 1, end: 99 }, { id: "y", start: 10, end: 20 }],
      feedings: [{ id: "g", ts: 7 }],
    };
    const out = mergeData(current, imported);
    expect(out.sessions.find((s) => s.id === "x")!.end).toBe(2);
    expect(out.sessions).toHaveLength(2);
    expect(out.feedings).toHaveLength(2);
  });
});

describe("deterministic uuids", () => {
  it("is stable and uuid-shaped", async () => {
    const a = await deterministicUuid("s_1700000000000");
    const b = await deterministicUuid("s_1700000000000");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("keeps existing uuids", async () => {
    const id = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    expect(await ensureUuid(id)).toBe(id);
    expect(await ensureUuid("s_123")).not.toBe("s_123");
  });
});

describe("sanitizeImport", () => {
  it("drops tombstoned entries and re-keys ids", async () => {
    const out = await sanitizeImport(
      {
        sessions: [
          { id: "s_100", start: NOW - 2 * HOUR_MS, end: NOW - HOUR_MS },
          { id: "dead", start: NOW - 5 * HOUR_MS, end: NOW - 4 * HOUR_MS },
        ],
        feedings: [{ id: "f_150", ts: NOW - HOUR_MS }],
      },
      { dead: 123 },
      NOW,
    );
    expect(out.sessions).toHaveLength(1);
    expect(out.sessions[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.sessions[0].id).toBe(await deterministicUuid("s_100"));
    expect(out.feedings[0].id).toBe(await deterministicUuid("f_150"));
  });
});

describe("export/import roundtrip", () => {
  it("a Somni export re-imports losslessly", async () => {
    const data = {
      sessions: [{ id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8", start: NOW - 2 * HOUR_MS, end: NOW - HOUR_MS }],
      feedings: [{ id: "6ba7b811-9dad-11d1-80b4-00c04fd430c8", ts: NOW - 90 * MIN_MS }],
    };
    const exported = buildExport(data, { targetNapMins: 180, cycleTimeMins: 240, dayStart: 6, targetNap: 3, cycleTime: 4 });
    const p = parseImport(exported);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const sane = await sanitizeImport(p.data, p.tombstones, NOW);
    expect(sane).toEqual(data);
    expect(normalizeSettings(p.settings)).toEqual({ targetNapMins: 180, cycleTimeMins: 240, dayStart: 6 });
  });
});

describe("normalizeSettings legacy fields", () => {
  it("converts hours-based legacy fields and clamps", () => {
    expect(normalizeSettings({ targetNap: 2, cycleTime: 4 })).toEqual({ targetNapMins: 120, cycleTimeMins: 240 });
    expect(normalizeSettings({ targetNapMins: 9999, dayStart: 99 })).toEqual({ targetNapMins: 360, dayStart: 23 });
    expect(normalizeSettings(null)).toEqual({});
  });
});

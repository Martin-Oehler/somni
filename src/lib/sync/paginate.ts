// Paginated reads.
//
// PostgREST caps every response at the project's `db.max_rows` (Supabase's
// default is 1000) and a client-supplied `.limit()` cannot raise that cap —
// it can only lower it. A plain `.select().limit(50000)` therefore returns a
// silently truncated page once a table passes 1000 live rows, with no error
// and no signal that anything is missing.
//
// So we page explicitly, with a keyset cursor on the primary key: `id` is
// unique and indexed, which keeps paging stable even if rows are inserted
// mid-pull (offset paging would skip or duplicate rows around the seam).
// We advance by whatever actually came back, so this is correct for any
// `max_rows` the project happens to be configured with.
import { supabase } from "./supabase";

const PAGE_SIZE = 1000;
const MAX_PAGES = 100; // 100k rows; a runaway loop should surface, not truncate

export type RowFilter = "live" | "tombstoned";

export const fetchAllRows = async <T extends { id: string }>(
  table: "sessions" | "feedings",
  columns: string,
  which: RowFilter,
): Promise<{ rows: T[]; error: string | null }> => {
  const rows: T[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const q = supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    const filtered =
      which === "live" ? q.is("deleted_at", null) : q.not("deleted_at", "is", null);
    const { data, error } = await (cursor ? filtered.gt("id", cursor) : filtered);

    if (error) return { rows, error: error.message };

    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    // An empty page is the only unambiguous end-of-table signal: a short page
    // may just mean we hit the server's per-response cap.
    if (!batch.length) return { rows, error: null };
    cursor = batch[batch.length - 1].id;
  }

  // Never return a partial set as if it were complete — that is the exact
  // failure this module exists to prevent.
  return { rows, error: `${table}: exceeded ${MAX_PAGES} pages while reading` };
};

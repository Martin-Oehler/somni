# Somni — Baby Tracker: Artifact → Standalone Android-feel PWA

## Context

The baby sleep & feeding tracker currently lives as a single-file Claude artifact ([baby_sleep_tracker_v2.html](baby_sleep_tracker_v2.html), ~2400 lines of vanilla HTML/CSS/JS). It depends on the artifact-only `window.storage` API, so it cannot run standalone. Goal: promote it to a private, installable PWA named **Somni** for exactly two users (Martin + partner), with:

- All existing functionality ported (timeline, projections, history, heatmap, undo, offline sync)
- A reworked UX that feels like a native Android app, built on **real Material Design 3**
- A modular, extensible TypeScript codebase replacing the single page

Decisions already made (existing transition plan + user confirmation):

| Topic | Decision |
|---|---|
| Backend | Supabase (Postgres + Auth + Realtime), closed signups, 2 manual accounts, RLS |
| Frontend | Svelte 5 + TypeScript + Vite |
| MD3 UI layer | **m3-svelte** component library, themed from the existing palette |
| Navigation | **Bottom navigation bar, 3 screens**: Home · Trends · Settings |
| Sync model | **Per-row sync** (sessions/feedings as Postgres rows, offline outbox, LWW) — replaces the blob+merge design |
| Hosting | Static host (Cloudflare Pages recommended), free tier |
| Name | Somni |

The old plan's assumption "sync layer ports nearly unchanged" is superseded by the per-row decision: the outbox/serialization *pattern* survives, the blob `mergeData`/tombstone-object machinery does not. Pure domain logic (time math, stats, projections, validation) ports nearly verbatim.

---

## 1. Supabase project (manual dashboard work + one SQL script)

Schema (`supabase/schema.sql`, kept in repo):

```sql
create table sessions (
  id uuid primary key,
  start_ts timestamptz not null,
  end_ts timestamptz,                      -- null = actively sleeping
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                   -- tombstone; soft delete
);
create table feedings (
  id uuid primary key,
  ts timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table shared_settings (             -- single shared row (targetNapMins, cycleTimeMins, dayStart)
  id int primary key check (id = 1),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

- RLS on all three tables: `to authenticated using (true) with check (true)` (per existing plan §3).
- Enable Realtime on all three tables.
- Auth: disable public signups; create 2 users manually; **email + password** login (one login per device, session auto-refreshes indefinitely).
- `colorScheme` becomes **device-local** (localStorage only) — syncing a theme choice across devices was a misfeature.

## 2. Repo structure (modularity contract)

```
somni/
  supabase/schema.sql
  public/  (icons: 512/192 maskable + monochrome)
  src/
    lib/
      types.ts              # Session, Feeding, SharedSettings, OutboxOp — the cross-layer contract, written FIRST
      time.ts               # fmtDur, dayKey, dayBounds, toLocalISO…  (direct port)
      projection.ts         # buildProjections                        (direct port)
      stats.ts              # percentile, summary/heatmap/history binning (direct port)
      validate.ts           # sleep/feed form rules incl. overlap check  (direct port)
      stores/               # Svelte 5 runes stores
        data.svelte.ts      # sessions+feedings, derived: activeSession, todayView, trends
        settings.svelte.ts  # shared settings + device-local colorScheme
        sync.svelte.ts      # status, outbox depth, event log (ring buffer, max 200)
        ui.svelte.ts        # snackbar/undo state, open sheet, active screen
      sync/
        supabase.ts         # client init from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
        local.ts            # localStorage snapshot of store + outbox (instant offline boot)
        outbox.ts           # persisted FIFO of row ops; serialized flush (promise chain, as today)
        realtime.ts         # postgres_changes subscriptions → store
        engine.ts           # startup reconcile, online/offline + visibilitychange triggers
      components/           # HeroCard, StatCards, Timeline, EntryList, EntrySheet,
                            # SummaryCards, HistoryRow, Heatmap, SyncStatusSheet, ActionBar
    screens/                # Home.svelte, Trends.svelte, Settings.svelte, Login.svelte
    App.svelte              # shell: top app bar, screen switcher (hash router), MD3 nav bar
    main.ts, app.css        # MD3 theme tokens (light+dark), edge-to-edge/base styles
```

Rules that keep it extensible: screens compose components; components read stores and call store actions; **only `sync/` talks to Supabase**; `lib/*.ts` domain modules are pure functions with unit tests. A future event type (diapers, medicine) = new table + type + store slice + component; no existing module changes shape.

## 3. Sync design (per-row, offline-first)

- **Write path:** user action → mutate store (instant UI) → append `OutboxOp {op: upsert|delete, table, row, queuedAt}` → persist locally → serialized flush upserts to Supabase (sets `updated_at = now()`; delete = set `deleted_at`).
- **Read path:** Realtime subscription applies remote row changes to the store immediately — *except* rows with a pending outbox op (local pending wins until flushed). On startup/visibility/reconnect: full pull of non-deleted rows, reconcile by `id` with `updated_at` last-write-wins, then flush outbox.
- **Conflicts:** per-row LWW. With 2 users, same-row concurrent edits are rare; the undo snackbar plus instant realtime visibility replace the old conflict modal. When LWW overrides a local pending edit, log it to the sync event log and show a toast ("Entry updated on the other device").
- **Ported invariants, relocated:** feed dedupe (<60 s apart) and the double-active-session guard move from merge-time into the write path + display layer; the 12 h active-session cap stays as the hero warning + projection cap.
- **Sync status UI:** keep the header cloud icon (ok/pending/fail) + the detail sheet + event log — port of today's tooltip/log, rendered as an MD3 bottom sheet.

## 4. Native-Android UX spec (MD3)

- **Theme:** MD3 color scheme (light + dark) seeded from the current palette — sleep blue `#7a9fd4` → primary, feed pink `#d84868` → tertiary, warm neutrals for surfaces. m3-svelte token overrides in `app.css`. `theme-color` meta per scheme so the Android status bar matches.
- **Shell:** MD3 top app bar (title + sync icon), MD3 navigation bar (Home / Trends / Settings). Hash-based screen switching so the Android back button navigates screens/sheets instead of exiting; fade-through transitions via the View Transitions API (respecting `prefers-reduced-motion`).
- **Home:** hero status card (sleeping/awake, live duration), two stat cards, today timeline (port of the SVG-less absolute-positioned renderer as a `Timeline.svelte` component), collapsible entry list with swipe-to-delete, and the **docked two-button action bar** (Start/End Sleep · Fed Now) as MD3 filled buttons above the nav bar — kept from the prototype because it's the right ergonomics for one-handed 3 a.m. use.
- **Feel details:** ripple on all interactive elements (m3-svelte), 48 dp touch targets, `navigator.vibrate(10)` on the two primary actions, entry forms as MD3 modal bottom sheets with drag handle, MD3 snackbar for undo (5 s, as today), `overscroll-behavior: none`, `user-select: none` on chrome, safe-area insets, edge-to-edge.
- **Timeline/heatmap/history** visuals port with MD3 surface/color roles; interactions unchanged (tap block/dot → detail popover → edit/delete).

## 5. PWA layer

- `vite-plugin-pwa` (Workbox): precache app shell, `registerType: 'autoUpdate'` + "App updated — reload" snackbar. **NetworkOnly for `*.supabase.co`** — never cache API calls.
- Manifest: `name: Somni`, `display: standalone`, `id`, portrait orientation, maskable 192/512 icons + monochrome icon (Android themed icons), `background_color` for the system splash screen.
- **App shortcuts** (long-press icon): "Start sleep" and "Log feed" via `?action=` launch params handled at startup — a genuinely native touch that's ~20 lines.
- Install via Chrome on Android → WebAPK (real launcher icon, splash, no browser UI). No TWA/Play Store packaging needed for personal use.

## 6. Implementation phases

1. **Scaffold** — Vite + Svelte 5 + TS + m3-svelte + vite-plugin-pwa + Vitest; `types.ts` first; `.env` for Supabase keys (gitignored; anon key is safe to ship, service key never touches the repo).
2. **Domain port** — `time/projection/stats/validate` extracted from the HTML file's `<script>` with unit tests locking in current behavior (dayKey anchoring, projection loop, overlap validation, percentile).
3. **Stores + local persistence** — boot from localStorage snapshot instantly, like today's `loadLocal()`.
4. **Sync engine** — supabase client, outbox, realtime, reconcile; sync event log.
5. **Auth** — Login screen, auth guard, session persistence.
6. **UI build** — theme → shell/nav → Home → Trends → Settings (prefs, export/import, sync log, logout). Export/import stays JSON-compatible with the artifact's format.
7. **PWA polish** — manifest, icons, SW, shortcuts, update snackbar.
8. **Data migration from the artifact** — see §6a below.
9. **Deploy** — Cloudflare Pages (static), install on both phones.

Supabase dashboard steps (project creation, disabling signups, creating the 2 users) are yours; everything else is code.

## 6a. Data migration from the artifact (explicit path)

The artifact already has everything needed to get data out; Somni's import UI is built to accept that exact format, so no one-off script or service-role access is required.

1. **Export from the artifact:** open the artifact one last time → Settings → **⬇ Export** → Copy. This yields the full dataset as JSON: `{ version: 2, exportedAt, data: { sessions: [{id, start, end}], feedings: [{id, ts}], tombstones }, settings }` (epoch-ms timestamps). Save it to a file as a backup, and send it to yourself so it's reachable from the phone/desktop where Somni runs.
2. **Import into Somni:** Settings → Import → paste JSON. The importer is a TS port of the artifact's strict `parseImport` + `migrateData` (accepts v1 and v2 formats, validates before enabling any button, shows "Found N sessions, M feedings" preview, Merge/Overwrite with two-tap arming — behavior preserved from the prototype).
3. **Mapping to rows:** each session/feeding becomes one Postgres row — epoch-ms → `timestamptz`, artifact ids preserved (non-UUID ids like `s_<start>` from v1 migrations are re-keyed to deterministic UUIDs so both devices' imports converge); tombstoned ids are skipped; feed-dedupe (<60 s) applied once at import. `settings` from the export populate the shared settings row. Rows go through the normal outbox, so the import works offline too and syncs to the partner's device via Realtime.
4. **Verify:** entry counts match the import preview, 7-day history and heatmap render identically to the artifact side-by-side, oldest events present. Only then delete the artifact data / retire the artifact.

Because export/import stays format-compatible in both directions, the same Export button in Somni doubles as the ongoing backup mechanism (§8).

## 7. Verification

- Unit tests (Vitest) green on the ported domain modules.
- Two-browser realtime test: edit in window A appears in window B without reload.
- Offline drill: DevTools offline → log sleep + feed → back online → rows appear in Supabase, other client updates.
- Unauthenticated `curl` with anon key returns zero rows (RLS); signup attempt fails (closed).
- Lighthouse: installable PWA, offline shell load.
- On-device: install on Android, verify standalone display, themed status bar, back-button behavior, app shortcuts, haptics; historical data intact after import.

## 8. Also considered / worth knowing

- **Supabase free tier** pauses projects after ~7 days without API traffic — daily use makes this moot, but a paused project needs a dashboard click to resume.
- **Backups:** free tier has no point-in-time recovery. The Export button doubles as backup; do it occasionally (or `pg_dump` if you ever care).
- **DST/dayStart limitation** (documented in the prototype) carries over: dayStart-anchored days assume 24 h; boundaries drift 1 h on DST-transition days. Accepted.
- **Timestamps** stored as `timestamptz`; all day-bucketing stays client-side local-time, matching current behavior.
- **Future extensions** the architecture leaves room for: multiple children (`child_id` column), diaper/medication events, nap-reminder web push (needs a Supabase Edge Function later), richer charts.
- Keep `baby_sleep_tracker_v2.html` in the repo as reference until migration is verified, then delete.

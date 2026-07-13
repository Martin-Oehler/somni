# Baby Tracker: Artifact → Full Web App Transition Plan

## Goal

Promote the baby sleep & feeding tracker from a Claude artifact to a standalone, privately hosted web app used by exactly two people (Martin + partner). Data must never be publicly accessible.

---

## 1. Current State

- Self-contained vanilla HTML/JS single-file SPA (artifact constraint)
- Three decoupled layers: **state**, **rendering**, **sync**
- Cloud sync via `window.storage` (artifact-only API — does not exist outside the sandbox)
- Features: 24h timeline visualization, sleep cycle projection, 7-day history, conflict detection, sync event log
- Full rewrite already decided (all 3 phases): entity IDs with migration, serialized write queue with conflict checking on all cloud writes, event-driven sync instead of 30s polling, UX overhaul (fixed bottom bar, undo snackbar instead of delete confirmation)

**Hard requirement of the migration:** replace `window.storage` with a real backend.

---

## 2. Target Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend | **Supabase** (Postgres + Auth + Realtime) | Zero ops, free tier ample for 2 users, realtime push matches the planned event-driven sync |
| Hosting | Static hosting (Netlify / Cloudflare Pages / Vercel) | SPA = static files; free |
| Language | **TypeScript** | Types the sync-critical surface end-to-end: entity IDs, queue entries, sync payloads, conflict states |
| UI | **Svelte** | Compiled reactivity replaces the hand-rolled rendering layer; tiny bundle; closest in spirit to the current vanilla approach |
| Build | **Vite** + `vite-plugin-pwa` (Workbox) | Needed for TS anyway; handles PWA cache versioning correctly |
| Client SDK | supabase-js | Auth, DB, realtime subscriptions |

**Explicitly rejected:** React (heavier runtime, unnecessary ceremony), SvelteKit/Next (no routing or SSR needed — one screen, statically hosted), PocketBase self-hosting (valid alternative, but managed was chosen).

**What ports over:** state layer and sync layer (write queue, conflict logic) nearly unchanged.
**What gets deleted:** the hand-written rendering layer, replaced by Svelte components.

---

## 3. Privacy & Auth Setup (Supabase)

1. **Disable public signups** — Dashboard → Authentication → Sign In / Up → turn off "Allow new users to sign up." This is the key move: nobody else can ever get an account.
2. **Create exactly two accounts manually** — Dashboard → Users → Add user.
3. **Login method** — magic links (lowest friction) or email+password. Sessions are long-lived and auto-refresh: log in once per device, stay logged in.
4. **Row Level Security** on all tables as backstop:

```sql
create policy "authenticated only"
on events for all
to authenticated
using (true)
with check (true);
```

Since both users share all data and signups are closed, "any authenticated user" is sufficient. Optional hardening: restrict the policy to the two specific user IDs.

5. **Key hygiene** — ship only the `anon` public key in the client. Never expose the service role key. With RLS + closed signups, the URL and anon key leak nothing to unauthenticated parties.

---

## 4. Sync Architecture on Supabase

- Replace `window.storage` calls in the sync layer with supabase-js queries.
- Replace 30s polling with **Supabase Realtime subscriptions** — changes push to the other device instantly (this is the event-driven sync from the rewrite plan, for free).
- Keep the serialized write queue and conflict checking: app works offline, writes queue up, flush on reconnect. Supabase is the source of truth.

---

## 5. PWA

- `manifest.json`: name, icons, `"display": "standalone"`, theme color → installable via "Add to Home Screen."
- Service worker via `vite-plugin-pwa` / Workbox: **cache-first for the app shell only**. Never cache `*.supabase.co` API calls — those always hit the network (stale API caches cause sync bugs).
- Session persists in localStorage → the installed PWA stays logged in.
- iOS caveat: Safari can evict PWA storage after ~7 days of non-use. Daily use makes this a non-issue; worst case is a re-login, no data loss (Supabase is source of truth).

---

## 6. Migration Steps

Fold the backend swap into the already-planned rewrite — do not do it as a separate pass.

1. **Supabase project setup** — create project, define schema (events table with entity IDs from rewrite Phase 1), enable RLS + policy, disable signups, create the two accounts.
2. **Scaffold** — Vite + TypeScript + Svelte project; define the event/queue/conflict types first (they are the contract between all layers).
3. **Port state layer** — mostly a straight TS conversion.
4. **Rebuild sync layer** — write queue + conflict logic on supabase-js; realtime subscription replaces polling.
5. **Rebuild UI as Svelte components** — timeline, projection, history, event log, plus the planned UX overhaul (fixed bottom bar, undo snackbar).
6. **Auth flow** — login screen, session handling, auth guard.
7. **PWA layer** — manifest + Workbox config.
8. **Data migration** — one-time export from `window.storage` (JSON dump via the artifact) → import script into Supabase.
9. **Deploy** — static host, install on both phones, verify two-device realtime sync and offline queue.

---

## 7. Verification Checklist

- [ ] Unauthenticated request with anon key returns no data (RLS works)
- [ ] Signup attempt from a third party fails
- [ ] Edit on phone A appears on phone B without reload (realtime)
- [ ] Airplane mode: writes queue, flush cleanly on reconnect, conflicts detected
- [ ] PWA opens instantly offline from cache
- [ ] Historical data fully migrated (7-day history + older events intact)

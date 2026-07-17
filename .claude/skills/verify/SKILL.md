---
name: verify
description: Self-verify changes against a disposable local Supabase stack (Docker). Use before committing any change that touches sync, auth, schema, or data paths. Production credentials are deliberately kept out of this repo — never ask for them or try to obtain them; all verification and dev runs go through the local stack.
---

# Verifying Somni changes

This household's production Supabase credentials are **deliberately not stored
in this repo** — `.env` holds placeholders only, so anything that would touch
production fails fast instead. Keep it that way: never ask the user for
production credentials, fetch them from Vercel/Supabase, or write them into
`.env`. All verification and UI testing runs against the local Docker stack;
production checks only happen when the user runs them with values they supply
themselves.

## Standard check sequence on a feature branch

```sh
npm test               # unit tests (vitest), no backend needed
npm run check          # svelte-check / TypeScript
npm run build          # must produce dist/index.html
npm run verify:local   # backend contract, against the local stack
```

`npm run verify:local` ([scripts/verify-local.mjs](../../../scripts/verify-local.mjs)):

- starts the local Supabase stack if it isn't running (needs Docker Desktop;
  the first ever run pulls images and takes minutes — later runs are fast)
- seeds [supabase/schema.sql](../../../supabase/schema.sql) and creates a
  local-only test login (`test@somni.local` / `somni-local-test`)
- runs the complete [verify-sync](../../../scripts/verify-sync.mjs) suite
  (RLS, closed signups, login, realtime round-trip) against
  `http://127.0.0.1:54321` — it never reads `.env`

## Exercising the UI against the local stack

```sh
npm run dev:local
```

Runs the Vite dev server wired to the local stack
([scripts/dev-local.mjs](../../../scripts/dev-local.mjs) passes the local
URL/key as process env, which overrides `.env` — never edit `.env` for this).
Log in with the test login above.

## Local stack lifecycle

```sh
npm run db:start   # start the stack
npm run db:stop    # stop it (keeps data)
npm run db:reset   # wipe local data, re-apply schema.sql (auth users are wiped
                   # too; verify:local recreates the test login automatically)
```

## Schema changes

[supabase/schema.sql](../../../supabase/schema.sql) is the single source of
truth: the local stack seeds from it (`[db.seed]` in
[supabase/config.toml](../../../supabase/config.toml)) and production applies
it via the management API ([docs/agent-setup.md](../../../docs/agent-setup.md),
step 4). After changing it, prove it with `npm run db:reset` +
`npm run verify:local`. Applying it to production is a separate, user-approved
step — and note the `alter publication` statements are not idempotent on an
existing database.

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

## Testing the UI yourself in a headless browser

For UI-affecting changes, don't stop at unit tests — drive the app in a real
browser and look at it. Playwright is a devDependency and
[scripts/browser.mjs](../../../scripts/browser.mjs) does the boilerplate:

1. Start `npm run dev:local` **in the background** (app at
   `http://localhost:5173`). Kill it when you're done.
2. Write a throwaway script **in the repo root** (so `playwright` resolves
   from `node_modules`) and delete it afterwards:

   ```js
   import { openApp } from "./scripts/browser.mjs";

   const { browser, page, errors } = await openApp();
   try {
     await page.getByRole("button", { name: "Start sleep" }).click();
     await page.screenshot({ path: "C:/path/to/scratchpad/home.png" });
   } finally {
     await browser.close(); // always — a leaked browser blocks later runs
   }
   console.log("console errors:", errors);
   ```

   `openApp()` opens a fresh 420×860 (portrait phone) page, logs in as the
   test user, and waits for the home screen ("Today's timeline"). Pass
   `{ login: false }` to test the login screen itself.
3. **Read the screenshots** you took — you can view images, so actually check
   that the UI looks right instead of only asserting on selectors.
4. Check `errors` (collected `console.error` + page errors) — it should be
   empty after every interaction.

Notes:

- If chromium is missing (fresh Playwright version), the launch error tells
  you the fix: `npx playwright install chromium` (one-time, ~100 MB).
- Browser interactions write real rows to the local DB. That's the point —
  but run `npm run db:reset` if you need a clean slate for a repeatable check.
- Useful stable anchors: labels `Email`/`Password`, buttons `Sign in`,
  `Start sleep`/`End sleep`, `Fed now`, `Log earlier sleep`/`Log earlier feed`,
  text `Today's timeline`, nav `Home`/`Trends`/`Settings`.

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

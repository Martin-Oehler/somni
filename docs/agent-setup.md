# Somni setup runbook — for AI agents

You are an AI coding agent setting up Somni for your user: a private, self-hosted
baby sleep & feeding tracker (static Vite/Svelte PWA + Supabase backend). This
runbook takes you from a fresh clone to a deployed production app. It was written
by an agent that performed this setup end-to-end, and it encodes the failure modes
you will otherwise rediscover.

**Outcome:** a Supabase project with the schema applied and signups disabled, a
static deployment (Vercel by default) with the two `VITE_*` variables baked into
the build, login accounts for the household, and a passing `npm run verify:sync`.

## Ground rules

- **Never print secrets into the conversation.** Not even truncated. Route every
  credential through files or environment variables. The one exception you cannot
  avoid: if the user pastes a token into the chat, it is already in the transcript —
  tell them to revoke it when you are done (Supabase tokens:
  <https://supabase.com/dashboard/account/tokens>).
- **Ask before mutating live infrastructure.** Applying schema SQL to the
  production database, disabling signups, and pushing to the production branch each
  deserve an explicit yes. Batch these questions so you interrupt the user once,
  not five times.
- **The anon key is public by design** (RLS + closed signups protect the data), so
  reading or writing it to `.env` is fine. The `service_role` key and database
  password are real secrets and must never land in the repo or the chat.
- The user must do two things themselves no matter what: authenticate you to each
  platform once, and (recommended) create the login accounts so passwords stay out
  of the conversation entirely.

## Prerequisites

- Node.js 20.19+ or 22.12+ with `npx` (both CLIs run via `npx`, no global installs).
- User has accounts at [supabase.com](https://supabase.com) and a static host
  (this runbook uses [Vercel](https://vercel.com)).

## 1. Clone, install, sanity-check

```sh
git clone https://github.com/<owner>/somni.git
cd somni
npm install
npm test          # unit tests, no backend needed
npm run build     # must produce dist/index.html
```

## 2. Authenticate to Supabase

`npx supabase login` **does not work from a non-TTY shell** — it fails with
`Cannot use automatic login flow inside non-TTY environments`. Do not fight it.
Ask the user for a personal access token instead:

> Please create a token at <https://supabase.com/dashboard/account/tokens>
> ("Generate new token") and give it to me. I'll use it for setup; revoke it
> afterwards.

Save the token (`sbp_...`) to a file **outside the repo** and use it as
`SUPABASE_ACCESS_TOKEN`. You do not need the Supabase CLI beyond this point —
the [management API](https://api.supabase.com) does everything, including running
SQL, so you also don't need `psql`, the database password, or `supabase link`.

```sh
export SUPABASE_ACCESS_TOKEN=$(cat /path/outside/repo/sb_token.txt)
npx supabase projects list   # verifies the token; note the project "ref"
```

## 3. Create or identify the Supabase project

If the user already created a project, get its `ref` from `projects list`.
Otherwise create one (needs the org id from `npx supabase orgs list` and a
generated database password — save the password to a local file for the user;
you will not need it yourself):

```sh
npx supabase projects create somni --org-id <org-id> --region <region> --db-password <generated>
```

The project URL is always `https://<ref>.supabase.co`.

## 4. Apply the database schema (ask first)

Get the user's OK, confirm the database is empty, then run
[`supabase/schema.sql`](../supabase/schema.sql) through the management API's SQL
endpoint. DDL returns `[]` on success.

```sh
# Is anything there already?
curl -s -X POST "https://api.supabase.com/v1/projects/<ref>/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select table_name from information_schema.tables where table_schema = '\''public'\''"}'

# Apply the schema (build the JSON payload from the file; don't hand-escape SQL)
node -e "const fs=require('fs');fs.writeFileSync('/tmp/payload.json',JSON.stringify({query:fs.readFileSync('supabase/schema.sql','utf8')}))"
curl -s -X POST "https://api.supabase.com/v1/projects/<ref>/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d @/tmp/payload.json
```

**Do not run `schema.sql` twice** — the `alter publication supabase_realtime add
table` statements are not idempotent. If the tables already exist, skip it.

Verify (expect all three tables with `rls: true`, `policies: 1`, `realtime: true`):

```sql
select c.relname as tbl, c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
       exists(select 1 from pg_publication_tables pt where pt.pubname='supabase_realtime'
              and pt.schemaname='public' and pt.tablename=c.relname) as realtime
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by 1;
```

## 5. Lock down auth (ask first)

Disabling public signups is the app's core privacy guarantee — any authenticated
user can read/write all data, so only household accounts may exist.

```sh
curl -s -X PATCH "https://api.supabase.com/v1/projects/<ref>/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"disable_signup":true}'
```

Then have the **user** create the accounts in the dashboard (Authentication →
Users → Add user, one per person) so passwords never touch the conversation.

## 6. Configure the frontend

The app reads exactly two variables ([src/lib/sync/supabase.ts](../src/lib/sync/supabase.ts)):
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Fetch the anon key via the
management API and write `.env` (gitignored) without echoing the key:

```sh
curl -s "https://api.supabase.com/v1/projects/<ref>/api-keys" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const k=JSON.parse(d).find(k=>k.name==='anon');require('fs').writeFileSync('.env','VITE_SUPABASE_URL=https://<ref>.supabase.co\nVITE_SUPABASE_ANON_KEY='+k.api_key+'\n')})"
```

Optionally start `npm run dev` so the user can log in locally.

## 7. Deploy to Vercel

**Login works non-TTY** (unlike Supabase): run `npx vercel login` in the
background, read its output, and give the user the printed
`https://vercel.com/oauth/device?user_code=XXXX-XXXX` link to approve. It exits
on its own once they do.

```sh
npx vercel login                          # background it; surface the device URL
npx vercel link --yes [--project <name>]  # link repo dir to the Vercel project
```

Set both env vars for all three environments, piping values from files so they
never appear in output (write `.env`'s two values to `url.txt` / `anon.txt` first):

```sh
for e in production preview development; do
  npx vercel env add VITE_SUPABASE_URL     $e < url.txt
  npx vercel env add VITE_SUPABASE_ANON_KEY $e < anon.txt
done
```

Deploy a preview, have the user test it, then promote:

```sh
npx vercel deploy          # preview URL for user testing
npx vercel deploy --prod   # or merge to the Git production branch if repo-connected
```

Pitfalls learned in production:

- **`vercel.json` in this repo pins `"framework": "vite"`. Keep it.** If the
  Vercel project was created against different code, its saved preset can be wrong
  (e.g. legacy "Svelte"/rollup, which serves `public/` instead of `dist/`) and
  every page 404s even though the build log looks successful. The file overrides
  the project setting on each deploy.
- **Preview URLs answer `302` to curl.** That is Vercel deployment protection,
  not a failure — the user must open the preview in a browser where they are
  logged in to Vercel. Don't burn time "fixing" it.
- **`VITE_*` values are baked in at build time.** Env vars must exist *before*
  the deployment builds; adding them later requires a redeploy.
- **If the user connected the Vercel↔Supabase integration:** it injects
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POSTGRES_*` etc., but Vite cannot read
  them (wrong prefix) — you still need the `VITE_*` pair. Also, `vercel env pull`
  returns **empty strings** for the integration's sensitive values (database URLs,
  service key); they are write-only. Get credentials from Supabase directly.

Any other static host works the same way: build `dist/` with the two `VITE_*`
vars present; no SPA rewrite rules are needed.

## 8. Verify end-to-end

```sh
npm run verify:sync
```

This checks that anonymous requests return zero rows (RLS) and signups are
rejected. With test credentials it also proves login and realtime round-trip
(ask the user to run this part themselves if they don't want to hand you a
password):

```sh
SOMNI_TEST_EMAIL=... SOMNI_TEST_PASSWORD=... npm run verify:sync
```

## 9. Hand back to the user

Report the production URL and remind them to:

1. **Revoke the Supabase access token** if it passed through the chat.
2. Install the PWA on each phone (open the URL → "Add to Home Screen").
3. Log in with the accounts they created in step 5.

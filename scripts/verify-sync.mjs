// Verifies the deployed Supabase project against Somni's security and sync
// expectations (plan §7) — run after the schema.sql + dashboard steps:
//
//   node scripts/verify-sync.mjs
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env. The realtime
// round-trip additionally needs one test login:
//
//   SOMNI_TEST_EMAIL=you@example.com SOMNI_TEST_PASSWORD=... node scripts/verify-sync.mjs
//
// Checks:
//   1. RLS       — anon select on all three tables returns zero rows
//   2. Signups   — anon signup attempt is rejected (closed project)
//   3. Login     — the test user can sign in            (needs credentials)
//   4. Realtime  — client A inserts a session row, client B (separate
//                  realtime connection) receives it via postgres_changes;
//                  test row is soft-deleted and then removed afterwards
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- minimal .env loader (no dependency) -----------------------------------
const env = { ...process.env };
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2];
  }
} catch {
  /* no .env — rely on process env */
}

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const EMAIL = env.SOMNI_TEST_EMAIL;
const PASSWORD = env.SOMNI_TEST_PASSWORD;

if (!URL_ || !ANON || URL_.includes("placeholder")) {
  console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not configured (still placeholder?)");
  process.exit(1);
}

let failures = 0;
const report = (ok, name, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const skip = (name, why) => console.log(`SKIP  ${name} — ${why}`);

// --- 1. RLS: anon client sees nothing ---------------------------------------
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
for (const table of ["sessions", "feedings", "shared_settings"]) {
  const { data, error } = await anon.from(table).select("id").limit(10);
  // Either an explicit permission error or an empty result is acceptable;
  // any rows leaking to anon is the failure we're guarding against.
  report(!!error || data.length === 0, `RLS blocks anon reads on ${table}`,
    error ? `rejected (${error.message})` : `${data?.length ?? 0} rows visible`);
}

// --- 2. Signups closed -------------------------------------------------------
{
  const probe = `somni-probe-${Date.now()}@example.com`;
  const { data, error } = await anon.auth.signUp({ email: probe, password: `Pw!${Date.now()}` });
  // Closed signups: expect an error. A returned user with no session can mean
  // email-confirmation mode, which still counts as "not silently open".
  report(!!error, "Signups are closed", error ? error.message : `signup accepted for ${data.user?.email}`);
}

// --- 3 + 4. Login + realtime round-trip --------------------------------------
if (!EMAIL || !PASSWORD) {
  skip("Login + realtime round-trip", "set SOMNI_TEST_EMAIL / SOMNI_TEST_PASSWORD to run");
} else {
  const clientA = createClient(URL_, ANON, { auth: { persistSession: false } });
  const clientB = createClient(URL_, ANON, { auth: { persistSession: false } });
  const [a, b] = await Promise.all([
    clientA.auth.signInWithPassword({ email: EMAIL, password: PASSWORD }),
    clientB.auth.signInWithPassword({ email: EMAIL, password: PASSWORD }),
  ]);
  report(!a.error && !b.error, "Test user can sign in", a.error?.message ?? b.error?.message ?? "");

  if (!a.error && !b.error) {
    const testId = crypto.randomUUID();
    const received = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 15000);
      clientB
        .channel("verify-sync")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sessions" },
          (p) => {
            if (p.new?.id === testId) {
              clearTimeout(timer);
              resolve(p.new);
            }
          },
        )
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            // Insert only once B is actually listening.
            const { error } = await clientA.from("sessions").upsert({
              id: testId,
              start_ts: new Date().toISOString(),
              end_ts: new Date().toISOString(),
              deleted_at: null,
            });
            if (error) {
              clearTimeout(timer);
              console.error(`      insert failed: ${error.message}`);
              resolve(null);
            }
          }
        });
    });

    const row = await received;
    report(!!row, "Realtime delivers row changes to a second client",
      row ? `session ${testId.slice(0, 8)}… received` : "nothing received within 15s");

    // Clean up: soft-delete (exercises the app's delete path + realtime),
    // then hard-delete so no test junk remains.
    await clientA.from("sessions").upsert({
      id: testId,
      start_ts: new Date().toISOString(),
      end_ts: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
    });
    await clientA.from("sessions").delete().eq("id", testId);
  }

  await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
  clientA.removeAllChannels();
  clientB.removeAllChannels();
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);

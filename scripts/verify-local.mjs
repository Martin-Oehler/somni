// Runs the full verify-sync suite against the LOCAL Supabase stack (Docker)
// instead of whatever .env points at, so agents can self-verify changes on
// feature branches without ever touching the production project:
//
//   npm run verify:local
//
// What it does:
//   1. Starts the local stack if it isn't running and reads its URL + keys,
//      refusing anything that is not 127.0.0.1/localhost (scripts/local-stack.mjs)
//   2. Creates the local test login via the auth admin API
//   3. Waits until realtime actually delivers events — after `supabase start`
//      or `db reset` the replication stream takes up to ~1 min to come up, and
//      subscriptions made before that silently receive nothing
//   4. Runs scripts/verify-sync.mjs with the local env, which overrides .env
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { getLocalStack, ensureTestUser, TEST_EMAIL, TEST_PASSWORD } from "./local-stack.mjs";

const stack = getLocalStack();
const { url, anonKey } = stack;
await ensureTestUser(stack);

// --- Wait for realtime to actually deliver events ---------------------------
const realtimeRoundTrip = async (attempt) => {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error) return false;
  const id = crypto.randomUUID();
  const ok = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 6000);
    c.channel(`rt-ready-${attempt}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (p) => {
        if (p.new?.id === id) {
          clearTimeout(timer);
          resolve(true);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { error: e } = await c.from("sessions").insert({ id, start_ts: new Date().toISOString(), end_ts: new Date().toISOString() });
          if (e) {
            clearTimeout(timer);
            resolve(false);
          }
        }
      });
  });
  await c.from("sessions").delete().eq("id", id);
  await c.auth.signOut();
  c.removeAllChannels();
  return ok;
};

{
  const deadline = Date.now() + 120_000;
  let attempt = 0;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    ready = await realtimeRoundTrip(++attempt);
    if (!ready) console.log(`Realtime not delivering yet (attempt ${attempt}) — retrying...`);
  }
  if (!ready) console.warn("Realtime never became ready — running the suite anyway so it reports the failure.");
}

// --- Run the verify suite against the local stack ----------------------------
console.log(`Verifying against local stack at ${url}\n`);
const verify = spawnSync(process.execPath, ["scripts/verify-sync.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: anonKey,
    SOMNI_TEST_EMAIL: TEST_EMAIL,
    SOMNI_TEST_PASSWORD: TEST_PASSWORD,
  },
});
process.exit(verify.status ?? 1);

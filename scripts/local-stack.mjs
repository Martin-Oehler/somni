// Shared helper for the LOCAL Supabase stack (Docker): ensure it is running,
// return its URL + keys (refusing anything non-local), and create the local
// test login. Used by verify-local.mjs and dev-local.mjs.
//
// The local service_role key and test credentials are well-known local
// development values — they are not secrets and never leave this machine.
import { spawnSync } from "node:child_process";

export const TEST_EMAIL = "test@somni.local";
export const TEST_PASSWORD = "somni-local-test";

const shell = process.platform === "win32";

const status = () => {
  const r = spawnSync("npx", ["supabase", "status", "-o", "json"], {
    shell,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) return null;
  try {
    // The CLI may print warnings before the JSON blob.
    return JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
  } catch {
    return null;
  }
};

export function getLocalStack() {
  let s = status();
  if (!s) {
    console.log("Local Supabase stack not running — starting it (first run pulls Docker images)...");
    const start = spawnSync("npx", ["supabase", "start"], { shell, stdio: "inherit" });
    if (start.status !== 0) {
      console.error("`supabase start` failed — is Docker running?");
      process.exit(1);
    }
    s = status();
  }
  if (!s) {
    console.error("Could not read `supabase status` output.");
    process.exit(1);
  }

  const url = s.API_URL ?? s.api_url;
  const anonKey = s.ANON_KEY ?? s.anon_key ?? s.PUBLISHABLE_KEY;
  const serviceKey = s.SERVICE_ROLE_KEY ?? s.service_role_key ?? s.SECRET_KEY;
  if (!url || !anonKey || !serviceKey) {
    console.error(`Missing URL/keys in supabase status output: ${Object.keys(s).join(", ")}`);
    process.exit(1);
  }
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    console.error(`Refusing to run against non-local URL: ${url}`);
    process.exit(1);
  }
  return { url, anonKey, serviceKey };
}

// Signups are disabled locally to mirror production, so the admin API is the
// only way to create the test login. Idempotent.
export async function ensureTestUser({ url, serviceKey }) {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    // 422 "already been registered" is the expected steady state.
    if (!/already.*registered|email_exists/i.test(body)) {
      console.error(`Creating test user failed (${res.status}): ${body}`);
      process.exit(1);
    }
  }
}

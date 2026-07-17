// Runs the Vite dev server against the LOCAL Supabase stack (Docker),
// regardless of what .env contains:
//
//   npm run dev:local
//
// Starts the stack if needed, makes sure the local test login exists, then
// launches `vite` with the local URL/key as env vars — actual process env has
// priority over .env in Vite, so .env stays untouched. Log in with the test
// credentials printed below.
import { spawnSync } from "node:child_process";
import { getLocalStack, ensureTestUser, TEST_EMAIL, TEST_PASSWORD } from "./local-stack.mjs";

const stack = getLocalStack();
await ensureTestUser(stack);

console.log(`Dev server → local Supabase at ${stack.url}`);
console.log(`Log in with ${TEST_EMAIL} / ${TEST_PASSWORD}\n`);

const r = spawnSync("npx", ["vite"], {
  shell: process.platform === "win32",
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: stack.url,
    VITE_SUPABASE_ANON_KEY: stack.anonKey,
  },
});
process.exit(r.status ?? 0);

// Helper for driving the app in a headless browser against the LOCAL stack —
// used by AI agents (and humans) to verify UI changes for real, not just via
// unit tests. Requires `npm run dev:local` to be running.
//
// Import it from a throwaway script placed in the repo root (so the
// `playwright` devDependency resolves):
//
//   import { openApp } from "./scripts/browser.mjs";
//   const { browser, page, errors } = await openApp();
//   await page.getByRole("button", { name: "Start sleep" }).click();
//   await page.screenshot({ path: "shot.png" });
//   await browser.close();
//
// One-time setup if chromium is missing: `npx playwright install chromium`.
import { chromium } from "playwright";
import { TEST_EMAIL, TEST_PASSWORD } from "./local-stack.mjs";

export async function openApp({ url = "http://localhost:5173/", login = true } = {}) {
  const browser = await chromium.launch();
  // Portrait phone viewport — Somni is a mobile-first PWA.
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  if (login) {
    await page.getByRole("button", { name: "Sign in" }).waitFor({ timeout: 15000 });
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Home screen marker — signals login + initial data load succeeded.
    await page.getByText("Today's timeline").waitFor({ timeout: 15000 });
  }
  return { browser, page, errors };
}

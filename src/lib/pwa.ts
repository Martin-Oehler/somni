// Service worker registration + "update available" snackbar.
// registerSW only checks for a new worker at registration time, i.e. on a cold load. An installed
// PWA is resumed from the background for weeks instead, so we also poll: hourly, and whenever the
// app becomes visible again.
import { registerSW } from "virtual:pwa-register";
import { snackbar } from "m3-svelte";

const HOUR = 60 * 60 * 1000;
const CHECK_DEBOUNCE = 5 * 60 * 1000;

let lastChecked = 0;

// Only ask Workbox to update once we know the server is actually reachable and serving the worker —
// a captive portal or a Vercel error page would otherwise surface as an install error.
const checkForUpdate = async (swUrl: string, registration: ServiceWorkerRegistration) => {
  if (!navigator.onLine || registration.installing) return;
  lastChecked = Date.now();
  try {
    const resp = await fetch(swUrl, { cache: "no-store" });
    if (resp.ok) await registration.update();
  } catch {
    // Offline or flaky network — try again on the next tick.
  }
};

export const initPwa = (): void => {
  // Only one snackbar shows at a time, so an UNDO toast can displace the update prompt. Remember it
  // and re-show on the next foreground.
  let updatePending = false;
  // onRegisteredSW fires more than once per page load; only wire the timers up for the first.
  let wired = false;

  const updateSW = registerSW({
    onNeedRefresh() {
      updatePending = true;
      promptRefresh();
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration || wired) return;
      wired = true;
      setInterval(() => void checkForUpdate(swUrl, registration), HOUR);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        if (updatePending) promptRefresh();
        else if (Date.now() - lastChecked > CHECK_DEBOUNCE) void checkForUpdate(swUrl, registration);
      });
    },
  });

  // timeout -1 keeps it up until the user reloads or dismisses it.
  function promptRefresh() {
    snackbar("App update available", { RELOAD: () => void updateSW(true) }, true, -1);
  }
};

// Service worker registration + "update available" snackbar.
import { registerSW } from "virtual:pwa-register";
import { snackbar } from "m3-svelte";

export const initPwa = (): void => {
  const updateSW = registerSW({
    onNeedRefresh() {
      snackbar("App update available", { RELOAD: () => void updateSW(true) }, true, 15_000);
    },
  });
};

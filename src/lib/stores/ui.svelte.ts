// UI state: active screen (hash-routed) and the currently open bottom
// sheet. Sheets participate in browser history so the Android back
// button closes them instead of leaving the app.
export type Screen = "home" | "trends" | "settings";

export type SheetState =
  | { kind: "sleep"; editId: string | null }
  | { kind: "feed"; editId: string | null }
  | { kind: "sync" }
  | { kind: "export" }
  | { kind: "import" }
  | null;

const SCREENS: Screen[] = ["home", "trends", "settings"];

const screenFromHash = (): Screen => {
  const h = location.hash.replace("#", "");
  return (SCREENS as string[]).includes(h) ? (h as Screen) : "home";
};

class UiStore {
  screen = $state<Screen>("home");
  sheet = $state<SheetState>(null);

  start(): void {
    this.screen = screenFromHash();
    window.addEventListener("hashchange", () => {
      const next = screenFromHash();
      if (next === this.screen) return;
      const apply = () => (this.screen = next);
      // Fade-through screen transition where supported (MD motion)
      if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.startViewTransition(apply);
      } else {
        apply();
      }
    });
    window.addEventListener("popstate", (e) => {
      // Back button: close an open sheet (its pushState entry was popped)
      if (this.sheet && !(e.state && e.state.somniSheet)) this.sheet = null;
    });
  }

  navigate(screen: Screen): void {
    if (screen === this.screen) return;
    location.hash = screen === "home" ? "" : screen;
  }

  openSheet(sheet: NonNullable<SheetState>): void {
    if (!this.sheet) history.pushState({ somniSheet: true }, "");
    this.sheet = sheet;
  }

  closeSheet(): void {
    if (!this.sheet) return;
    this.sheet = null;
    if (history.state && history.state.somniSheet) history.back();
  }
}

export const ui = new UiStore();

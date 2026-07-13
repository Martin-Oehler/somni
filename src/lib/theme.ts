// Color scheme switching. The generated theme (src/theme.css) uses
// light-dark() throughout, so switching is just the color-scheme property
// on <html>. The theme-color meta tracks the resolved surface color so the
// Android status bar matches.
import type { ColorScheme } from "./types";

export const applyColorScheme = (scheme: ColorScheme): void => {
  document.documentElement.style.colorScheme = scheme === "system" ? "light dark" : scheme;
  requestAnimationFrame(updateThemeColorMeta);
};

const updateThemeColorMeta = (): void => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.body).backgroundColor;
  if (bg) meta.content = bg;
};

export const watchSystemScheme = (onChange: () => void): void => {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    onChange();
    requestAnimationFrame(updateThemeColorMeta);
  });
};

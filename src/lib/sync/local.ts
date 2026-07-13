// localStorage persistence: instant offline boot (paint from cache, then
// reconcile) and outbox durability across restarts. Data volume is tiny
// (a few KB per month), so localStorage is ample.
import type { ColorScheme, OutboxOp, SharedSettings, TrackerData } from "../types";
import { DEFAULT_SETTINGS, normalizeSettings } from "../settingsSchema";

const KEY_DATA = "somni_data_v1";
const KEY_OUTBOX = "somni_outbox_v1";
const KEY_SETTINGS = "somni_settings_v1";
const KEY_SCHEME = "somni_colorscheme";

const read = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/blocked — cloud remains source of truth
  }
};

export const loadLocalData = (): TrackerData => {
  const p = read(KEY_DATA) as Partial<TrackerData> | null;
  return {
    sessions: Array.isArray(p?.sessions) ? p.sessions : [],
    feedings: Array.isArray(p?.feedings) ? p.feedings : [],
  };
};

export const saveLocalData = (data: TrackerData): void => write(KEY_DATA, data);

export const loadOutbox = (): OutboxOp[] => {
  const p = read(KEY_OUTBOX);
  return Array.isArray(p) ? (p as OutboxOp[]) : [];
};

export const saveOutbox = (ops: OutboxOp[]): void => write(KEY_OUTBOX, ops);

export const loadLocalSettings = (): SharedSettings => ({
  ...DEFAULT_SETTINGS,
  ...normalizeSettings(read(KEY_SETTINGS)),
});

export const saveLocalSettings = (s: SharedSettings): void => write(KEY_SETTINGS, s);

export const loadColorScheme = (): ColorScheme => {
  const v = read(KEY_SCHEME);
  return v === "light" || v === "dark" ? v : "system";
};

export const saveColorScheme = (s: ColorScheme): void => write(KEY_SCHEME, s);

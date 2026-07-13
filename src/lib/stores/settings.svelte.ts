// Settings: `shared` syncs across devices via the shared_settings row;
// `colorScheme` is deliberately device-local (a theme choice on one phone
// should not restyle the other).
import { DEFAULT_SETTINGS } from "../settingsSchema";
import type { ColorScheme, SharedSettings } from "../types";

class SettingsStore {
  shared = $state<SharedSettings>({ ...DEFAULT_SETTINGS });
  colorScheme = $state<ColorScheme>("system");
}

export const settings = new SettingsStore();

<script lang="ts">
  import { Button, Icon, ListItem, Select } from "m3-svelte";
  import iconDownload from "@ktibow/iconset-material-symbols/download-rounded";
  import iconUpload from "@ktibow/iconset-material-symbols/upload-rounded";
  import iconSync from "@ktibow/iconset-material-symbols/sync-rounded";
  import iconLogout from "@ktibow/iconset-material-symbols/logout-rounded";
  import { settings } from "../lib/stores/settings.svelte";
  import { clock } from "../lib/stores/clock.svelte";
  import { auth, logout } from "../lib/stores/auth.svelte";
  import { ui } from "../lib/stores/ui.svelte";
  import { updateSharedSettings, updateColorScheme, toggleIrregularToday } from "../lib/actions";
  import { clampInt } from "../lib/time";
  import { civilDate } from "../lib/entrainment/math";
  import type { ColorScheme } from "../lib/types";

  const STRICTNESS_LABELS = ["Flexible", "Relaxed", "Balanced", "Firm", "Strict"];

  const minsToTime = (mins: number): string =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  // Local field state so typing doesn't sync half-finished values.
  let dayStartVal = $state(String(settings.shared.dayStart));
  let birthdateVal = $state(settings.shared.birthdate ?? "");
  let bedtimeVal = $state(minsToTime(settings.shared.bedtimeMins));

  // Keep fields in step with remote settings updates.
  $effect(() => {
    dayStartVal = String(settings.shared.dayStart);
    birthdateVal = settings.shared.birthdate ?? "";
    bedtimeVal = minsToTime(settings.shared.bedtimeMins);
  });

  const todayKey = $derived(civilDate(clock.now));
  const todayIrregular = $derived(settings.shared.irregularDays.includes(todayKey));

  const commitDayStart = () => {
    updateSharedSettings({ dayStart: clampInt(dayStartVal, 0, 23, settings.shared.dayStart) });
  };
  const commitBirthdate = () => {
    const t = Date.parse(birthdateVal);
    const valid = birthdateVal && Number.isFinite(t) && t <= Date.now();
    updateSharedSettings({ birthdate: valid ? birthdateVal : null });
  };
  const commitBedtime = () => {
    const [h, m] = bedtimeVal.split(":").map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      updateSharedSettings({ bedtimeMins: clampInt(h * 60 + m, 960, 1380, settings.shared.bedtimeMins) });
    }
  };
  const commitStrictness = (e: Event) => {
    updateSharedSettings({ strictness: clampInt((e.currentTarget as HTMLInputElement).value, 0, 4, settings.shared.strictness) });
  };

  const schemeOptions = [
    { text: "System", value: "system" },
    { text: "Light", value: "light" },
    { text: "Dark", value: "dark" },
  ];
</script>

<div class="section-head">Baby</div>
<div class="card">
  <label class="pref-row">
    <span>Birthdate <small>tunes age-appropriate rhythms</small></span>
    <input type="date" bind:value={birthdateVal} max={civilDate(clock.now)} onchange={commitBirthdate} />
  </label>
</div>

<div class="section-head">Plan</div>
<div class="card">
  <label class="pref-row">
    <span>Bedtime target</span>
    <input type="time" bind:value={bedtimeVal} onchange={commitBedtime} />
  </label>
  <div class="pref-row column">
    <div class="strictness-head">
      <span>Bedtime strictness</span>
      <span class="strictness-value">{STRICTNESS_LABELS[settings.shared.strictness] ?? "Balanced"}</span>
    </div>
    <input
      type="range"
      min="0"
      max="4"
      step="1"
      value={settings.shared.strictness}
      oninput={commitStrictness}
      aria-label="Bedtime strictness"
    />
    <div class="strictness-ends"><span>Flexible</span><span>Strict</span></div>
  </div>
  <label class="pref-row toggle">
    <span>Today was unusual <small>excludes today from learning</small></span>
    <input type="checkbox" checked={todayIrregular} onchange={() => toggleIrregularToday(todayKey)} />
  </label>
</div>

<div class="section-head">Preferences</div>
<div class="card">
  <label class="pref-row">
    <span>Day starts at <small>hour, 0–23</small></span>
    <input type="number" min="0" max="23" bind:value={dayStartVal} onchange={commitDayStart} />
  </label>
  <div class="pref-row">
    <span>Color scheme <small>this device only</small></span>
    <Select
      label="Scheme"
      options={schemeOptions}
      value={settings.colorScheme}
      onchange={(e) => updateColorScheme((e.currentTarget as HTMLSelectElement).value as ColorScheme)}
    />
  </div>
</div>

<div class="section-head">Data</div>
<div class="card">
  <ListItem
    headline="Export"
    supporting="Backup as JSON (compatible with the old tracker)"
    onclick={() => ui.openSheet({ kind: "export" })}
  >
    {#snippet leading()}<Icon icon={iconDownload} size={24} />{/snippet}
  </ListItem>
  <ListItem
    headline="Import"
    supporting="Migrate from the old tracker or restore a backup"
    onclick={() => ui.openSheet({ kind: "import" })}
  >
    {#snippet leading()}<Icon icon={iconUpload} size={24} />{/snippet}
  </ListItem>
  <ListItem
    headline="Sync status"
    supporting="Connection, queued writes, event log"
    onclick={() => ui.openSheet({ kind: "sync" })}
  >
    {#snippet leading()}<Icon icon={iconSync} size={24} />{/snippet}
  </ListItem>
</div>

<div class="section-head">Account</div>
<div class="card account">
  <div class="account-info">
    <span class="account-label">Signed in as</span>
    <span class="account-email">{auth.userEmail}</span>
  </div>
  <Button variant="outlined" size="s" iconType="left" onclick={() => void logout()}>
    <Icon icon={iconLogout} size={18} />
    Sign out
  </Button>
</div>

<style>
  .card {
    background: var(--m3c-surface-container-low);
    border-radius: var(--m3-shape-medium);
    overflow: hidden;
    padding: 0.25rem 0;
  }
  .pref-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--m3c-outline-variant);
  }
  .pref-row:last-child {
    border-bottom: none;
  }
  .pref-row > span {
    font-size: 0.9375rem;
  }
  .pref-row small {
    display: block;
    font-size: 0.75rem;
    color: var(--m3c-on-surface-variant);
  }
  .pref-row input {
    width: 6rem;
    padding: 0.625rem;
    text-align: center;
    background: transparent;
    border: 1px solid var(--m3c-outline);
    border-radius: var(--m3-shape-small);
    color: inherit;
    font: inherit;
    font-size: 1rem;
    min-height: 2.75rem;
    outline: none;
  }
  .pref-row input:focus {
    border-color: var(--m3c-primary);
  }
  .pref-row input[type="checkbox"] {
    width: 1.25rem;
    min-height: 1.25rem;
    accent-color: var(--m3c-primary);
  }
  .pref-row.column {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
  .pref-row.column input[type="range"] {
    width: 100%;
    accent-color: var(--m3c-primary);
  }
  .strictness-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .strictness-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--m3c-primary);
  }
  .strictness-ends {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--m3c-on-surface-variant);
  }
  .account {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
  }
  .account-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .account-label {
    font-size: 0.75rem;
    color: var(--m3c-on-surface-variant);
  }
  .account-email {
    font-size: 0.9375rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

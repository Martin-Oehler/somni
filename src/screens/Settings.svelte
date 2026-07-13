<script lang="ts">
  import { Button, Icon, ListItem, Select } from "m3-svelte";
  import iconDownload from "@ktibow/iconset-material-symbols/download-rounded";
  import iconUpload from "@ktibow/iconset-material-symbols/upload-rounded";
  import iconSync from "@ktibow/iconset-material-symbols/sync-rounded";
  import iconLogout from "@ktibow/iconset-material-symbols/logout-rounded";
  import { settings } from "../lib/stores/settings.svelte";
  import { auth, logout } from "../lib/stores/auth.svelte";
  import { ui } from "../lib/stores/ui.svelte";
  import { updateSharedSettings, updateColorScheme } from "../lib/actions";
  import { clampInt } from "../lib/time";
  import type { ColorScheme } from "../lib/types";

  // Local field state so typing doesn't sync half-finished numbers; committed
  // on change/blur, clamped like the prototype.
  let napVal = $state(String(settings.shared.targetNapMins));
  let cycleVal = $state(String(settings.shared.cycleTimeMins));
  let dayStartVal = $state(String(settings.shared.dayStart));

  // Keep fields in step with remote settings updates.
  $effect(() => {
    napVal = String(settings.shared.targetNapMins);
    cycleVal = String(settings.shared.cycleTimeMins);
    dayStartVal = String(settings.shared.dayStart);
  });

  const commit = () => {
    updateSharedSettings({
      targetNapMins: clampInt(napVal, 15, 360, settings.shared.targetNapMins),
      cycleTimeMins: clampInt(cycleVal, 30, 720, settings.shared.cycleTimeMins),
      dayStart: clampInt(dayStartVal, 0, 23, settings.shared.dayStart),
    });
  };

  const schemeOptions = [
    { text: "System", value: "system" },
    { text: "Light", value: "light" },
    { text: "Dark", value: "dark" },
  ];
</script>

<div class="section-head">Preferences</div>
<div class="card">
  <label class="pref-row">
    <span>Target nap <small>minutes</small></span>
    <input type="number" min="15" max="360" bind:value={napVal} onchange={commit} />
  </label>
  <label class="pref-row">
    <span>Sleep–wake cycle <small>minutes</small></span>
    <input type="number" min="30" max="720" bind:value={cycleVal} onchange={commit} />
  </label>
  <label class="pref-row">
    <span>Day starts at <small>hour, 0–23</small></span>
    <input type="number" min="0" max="23" bind:value={dayStartVal} onchange={commit} />
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

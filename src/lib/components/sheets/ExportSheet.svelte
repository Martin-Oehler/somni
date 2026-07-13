<script lang="ts">
  import { Button, snackbar } from "m3-svelte";
  import { data } from "../../stores/data.svelte";
  import { settings } from "../../stores/settings.svelte";
  import { ui } from "../../stores/ui.svelte";
  import { buildExport } from "../../importer";
  import { toPortableSettings } from "../../settingsSchema";

  const json = buildExport(data.snapshot, toPortableSettings(settings.shared));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      snackbar("Copied to clipboard");
    } catch {
      snackbar("Copy failed — select and copy manually");
    }
  };

  const download = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `somni-export-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
</script>

<div class="sheet-body">
  <h2 class="sheet-title">Export data</h2>
  <p class="note">Full backup — sessions, feedings and settings. Compatible with the import below.</p>
  <label class="field">
    <span>Export JSON</span>
    <textarea readonly rows="7" value={json}></textarea>
  </label>
  <div class="sheet-actions">
    <Button variant="text" onclick={() => ui.closeSheet()}>Close</Button>
    <Button variant="tonal" onclick={download}>Download</Button>
    <Button variant="filled" onclick={() => void copy()}>Copy</Button>
  </div>
</div>

<style>
  .note {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--m3c-on-surface-variant);
  }
  textarea {
    font-family: var(--m3-font-mono, monospace);
    font-size: 0.75rem;
    resize: none;
  }
</style>

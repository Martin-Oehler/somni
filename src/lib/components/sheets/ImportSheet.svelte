<script lang="ts">
  import { Button, snackbar } from "m3-svelte";
  import { ui } from "../../stores/ui.svelte";
  import { parseImport } from "../../importer";
  import { applyImport } from "../../actions";

  let raw = $state("");
  let busy = $state(false);
  let overwriteArmed = $state(false);
  let armTimer: ReturnType<typeof setTimeout> | undefined;

  const parsed = $derived(raw.trim() ? parseImport(raw.trim()) : null);

  const statusText = $derived(
    !parsed
      ? ""
      : parsed.ok
        ? `Found ${parsed.data.sessions.length} sessions, ${parsed.data.feedings.length} feedings`
        : parsed.error,
  );

  const apply = async (overwrite: boolean) => {
    if (!parsed?.ok || busy) return;
    if (overwrite && !overwriteArmed) {
      // Two-tap arming: garbage can never silently wipe anything.
      overwriteArmed = true;
      clearTimeout(armTimer);
      armTimer = setTimeout(() => (overwriteArmed = false), 3000);
      return;
    }
    busy = true;
    try {
      const result = await applyImport(parsed, overwrite);
      ui.closeSheet();
      snackbar(`Imported ${result.sessions} sessions, ${result.feedings} feedings`);
    } finally {
      busy = false;
    }
  };
</script>

<div class="sheet-body">
  <h2 class="sheet-title">Import data</h2>
  <p class="note">
    Paste an export from the old tracker or from Somni. Nothing is applied until you choose Merge or
    Overwrite.
  </p>
  <label class="field">
    <span>Import JSON</span>
    <textarea
      rows="6"
      bind:value={raw}
      class:invalid={parsed !== null && !parsed.ok}
      oninput={() => (overwriteArmed = false)}
    ></textarea>
  </label>
  <p class="field-error" class:ok={parsed?.ok} aria-live="polite">{statusText}</p>
  <div class="sheet-actions">
    <Button variant="text" onclick={() => ui.closeSheet()}>Cancel</Button>
    <Button variant="tonal" disabled={!parsed?.ok || busy} onclick={() => void apply(false)}>Merge</Button>
    <div class="danger-scope">
      <Button variant="filled" disabled={!parsed?.ok || busy} onclick={() => void apply(true)}>
        {overwriteArmed ? "Replace ALL?" : "Overwrite"}
      </Button>
    </div>
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
  textarea.invalid {
    border-color: var(--m3c-error);
  }
  .field-error.ok {
    color: var(--m3c-primary);
  }
  .danger-scope {
    display: contents;
  }
  .danger-scope :global(button) {
    background-color: var(--m3c-error);
    color: var(--m3c-on-error);
  }
</style>

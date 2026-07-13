<script lang="ts">
  import { Button } from "m3-svelte";
  import { data } from "../../stores/data.svelte";
  import { ui } from "../../stores/ui.svelte";
  import { saveFeed, deleteFeeding } from "../../actions";
  import { validateFeed } from "../../validate";
  import { nowMaxISO, toLocalISO } from "../../time";

  let { editId }: { editId: string | null } = $props();

  // The sheet is recreated per open; capturing the entry at open time is intended.
  // svelte-ignore state_referenced_locally
  const existing = editId ? data.feedings.find((f) => f.id === editId) : undefined;

  let tsVal = $state(existing ? toLocalISO(existing.ts) : toLocalISO(Date.now()));

  const parse = (v: string): number | null => (v ? new Date(v).getTime() : null);
  const error = $derived(validateFeed(parse(tsVal)));

  const save = () => {
    if (error) return;
    saveFeed(parse(tsVal)!, editId);
    ui.closeSheet();
  };
  const remove = () => {
    if (!editId) return;
    ui.closeSheet();
    deleteFeeding(editId);
  };
</script>

<div class="sheet-body">
  <h2 class="sheet-title">{editId ? "Edit feeding" : "Log earlier feeding"}</h2>
  {#if editId && !existing}
    <p class="field-error">That feeding no longer exists.</p>
    <div class="sheet-actions">
      <Button variant="tonal" onclick={() => ui.closeSheet()}>Close</Button>
    </div>
  {:else}
    <label class="field">
      <span>Time</span>
      <input type="datetime-local" bind:value={tsVal} max={nowMaxISO()} />
    </label>
    <p class="field-error" aria-live="polite">{error ?? ""}</p>
    <div class="sheet-actions">
      {#if editId}
        <div class="danger-scope">
          <Button variant="text" onclick={remove}>Delete</Button>
        </div>
      {/if}
      <Button variant="text" onclick={() => ui.closeSheet()}>Cancel</Button>
      <Button variant="filled" disabled={!!error} onclick={save}>Save</Button>
    </div>
  {/if}
</div>

<style>
  .danger-scope {
    display: contents;
  }
  .danger-scope :global(button) {
    color: var(--m3c-error);
  }
  .sheet-actions :global(button) {
    width: 100%;
    justify-content: center;
  }
</style>

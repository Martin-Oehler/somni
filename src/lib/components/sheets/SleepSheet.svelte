<script lang="ts">
  import { Button } from "m3-svelte";
  import { data } from "../../stores/data.svelte";
  import { ui } from "../../stores/ui.svelte";
  import { saveSleep, deleteSession } from "../../actions";
  import { validateSleep } from "../../validate";
  import { nowMaxISO, toLocalISO } from "../../time";

  let { editId }: { editId: string | null } = $props();

  // The sheet is recreated per open; capturing the entry at open time is intended.
  // svelte-ignore state_referenced_locally
  const existing = editId ? data.sessions.find((s) => s.id === editId) : undefined;

  let startVal = $state(existing ? toLocalISO(existing.start) : toLocalISO(Date.now()));
  let endVal = $state(existing?.end ? toLocalISO(existing.end) : "");

  const parse = (v: string): number | null => (v ? new Date(v).getTime() : null);
  const error = $derived(validateSleep(parse(startVal), parse(endVal), data.sessions, editId));

  const save = () => {
    if (error) return;
    saveSleep(parse(startVal)!, parse(endVal), editId);
    ui.closeSheet();
  };
  const remove = () => {
    if (!editId) return;
    ui.closeSheet();
    deleteSession(editId);
  };
</script>

<div class="sheet-body">
  <h2 class="sheet-title">{editId ? "Edit sleep" : "Log earlier sleep"}</h2>
  {#if editId && !existing}
    <p class="field-error">That session no longer exists.</p>
    <div class="sheet-actions">
      <Button variant="tonal" onclick={() => ui.closeSheet()}>Close</Button>
    </div>
  {:else}
    <label class="field">
      <span>Start time</span>
      <input type="datetime-local" bind:value={startVal} max={nowMaxISO()} />
    </label>
    <label class="field">
      <span>End time (leave empty if still sleeping)</span>
      <input type="datetime-local" bind:value={endVal} max={nowMaxISO()} />
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

<script lang="ts">
  import { Button } from "m3-svelte";
  import { data } from "../../stores/data.svelte";
  import { ui } from "../../stores/ui.svelte";
  import { saveSleep, deleteSession } from "../../actions";
  import { validateSleep } from "../../validate";
  import { nowMaxISO, toLocalISO } from "../../time";
  import GlanceHeader from "./GlanceHeader.svelte";

  let { editId }: { editId: string | null } = $props();

  // The sheet is recreated per open; capturing the entry at open time is intended.
  // svelte-ignore state_referenced_locally
  const existing = editId ? data.sessions.find((s) => s.id === editId) : undefined;

  let startVal = $state(existing ? toLocalISO(existing.start) : toLocalISO(Date.now()));
  let endVal = $state(existing?.end ? toLocalISO(existing.end) : "");
  // Settling time (latency signal). null = "quick", the censored-normal default.
  // svelte-ignore state_referenced_locally
  let settleVal = $state<number | null>(existing?.settleMins ?? null);

  const settleOptions: { label: string; value: number | null }[] = [
    { label: "Quick", value: null },
    { label: "~30", value: 30 },
    { label: "~45", value: 45 },
    { label: "~60+", value: 60 },
  ];

  const parse = (v: string): number | null => (v ? new Date(v).getTime() : null);
  const error = $derived(validateSleep(parse(startVal), parse(endVal), data.sessions, editId));

  const save = () => {
    if (error) return;
    saveSleep(parse(startVal)!, parse(endVal), editId, settleVal);
    ui.closeSheet();
  };
  const remove = () => {
    if (!editId) return;
    deleteSession(editId);
    ui.closeSheet();
  };
</script>

<div class="sheet-body">
  {#if editId && !existing}
    <h2 class="sheet-title">Edit sleep</h2>
    <p class="field-error">That session no longer exists.</p>
    <div class="sheet-actions">
      <Button variant="tonal" onclick={() => ui.closeSheet()}>Close</Button>
    </div>
  {:else}
    <GlanceHeader kind="sleep" start={parse(startVal)} end={parse(endVal)} isNew={!editId} {error} />
    <label class="field">
      <span>Start time</span>
      <input type="datetime-local" bind:value={startVal} max={nowMaxISO()} />
    </label>
    <label class="field">
      <span>End time (leave empty if still sleeping)</span>
      <input type="datetime-local" bind:value={endVal} max={nowMaxISO()} />
    </label>
    {#if parse(endVal) !== null}
      <div class="field">
        <span>Settling <small>how long to fall asleep — helps tune the plan</small></span>
        <div class="settle-chips" role="group" aria-label="Settling time">
          {#each settleOptions as opt (opt.label)}
            <button
              type="button"
              class="settle-chip"
              class:selected={settleVal === opt.value}
              aria-pressed={settleVal === opt.value}
              onclick={() => (settleVal = opt.value)}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}
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
  .settle-chips {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .settle-chip {
    flex: 1;
    min-width: 3.5rem;
    padding: 0.5rem 0.5rem;
    min-height: 2.5rem;
    font: inherit;
    font-size: 0.9rem;
    background: transparent;
    border: 1px solid var(--m3c-outline);
    border-radius: var(--m3-shape-full, 999px);
    color: inherit;
    cursor: pointer;
  }
  .settle-chip.selected {
    background: var(--m3c-secondary-container);
    color: var(--m3c-on-secondary-container);
    border-color: transparent;
  }
  .settle-chip:focus-visible {
    outline: 2px solid var(--m3c-primary);
    outline-offset: 2px;
  }
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

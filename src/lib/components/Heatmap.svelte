<script lang="ts">
  import { Slider } from "m3-svelte";
  import { data } from "../stores/data.svelte";
  import { settings } from "../stores/settings.svelte";
  import { clock } from "../stores/clock.svelte";
  import { SLOT_SIZES_MINS, computeHeatmap } from "../stats";
  import { weekStart } from "../time";

  let slotIndex = $state(2); // default 1h slots

  const slotMins = $derived(SLOT_SIZES_MINS[slotIndex] ?? 60);
  const slotLabel = $derived(slotMins < 60 ? `${slotMins}m` : `${slotMins / 60}h`);

  const weeks = $derived(
    computeHeatmap(data.sessions, slotMins, weekStart(clock.now, settings.shared.dayStart), clock.now),
  );

  const slots = $derived(Math.round(1440 / slotMins));
  const axisLabels = $derived.by(() => {
    const every = slotMins <= 30 ? 180 : slotMins <= 60 ? 360 : 720;
    const out: { pct: number; text: string; edge: "start" | "end" | "mid" }[] = [];
    for (let s = 0; s <= slots; s++) {
      const mins = s * slotMins;
      if (mins % every !== 0) continue;
      const total = mins + settings.shared.dayStart * 60;
      const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
      const mm = String(total % 60).padStart(2, "0");
      out.push({
        pct: (s / slots) * 100,
        text: `${hh}:${mm}`,
        edge: s === 0 ? "start" : s === slots ? "end" : "mid",
      });
    }
    return out;
  });

  const weekLabel = (ts: number): string =>
    new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
</script>

<div class="heatmap">
  <div class="heatmap-head">
    <span class="legend">
      Awake
      <span class="gradient"></span>
      Asleep
    </span>
    <span class="slot-control">
      <Slider bind:value={slotIndex} min={0} max={3} step={1} stops size="xs" />
      <output>{slotLabel}</output>
    </span>
  </div>
  {#if !weeks.length}
    <div class="empty">No data yet</div>
  {:else}
    <div class="axis">
      {#each axisLabels as l (l.pct)}
        <span
          class="axis-label"
          style:left="{l.pct}%"
          style:transform={l.edge === "start" ? "none" : l.edge === "end" ? "translateX(-100%)" : "translateX(-50%)"}
        >
          {l.text}
        </span>
      {/each}
    </div>
    {#each weeks as w (w.weekStart)}
      <div class="week-row" class:sparse={w.sparse}>
        <span class="week-label">{weekLabel(w.weekStart)}</span>
        <div class="cells">
          {#each w.cells as cell, i (i)}
            {#if cell === null}
              <div class="cell untracked"></div>
            {:else}
              <div class="cell" style:--f={cell}></div>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .heatmap {
    background: var(--m3c-surface-container-low);
    border-radius: var(--m3-shape-medium);
    padding: 0.75rem;
  }
  .heatmap-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--m3c-on-surface-variant);
  }
  .gradient {
    display: inline-block;
    width: 72px;
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--m3c-surface-container-high), var(--m3c-primary));
  }
  .slot-control {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex: 1;
    min-width: 9rem;
    max-width: 14rem;
  }
  .slot-control output {
    font-size: 0.75rem;
    min-width: 2rem;
    text-align: right;
    color: var(--m3c-on-surface-variant);
  }
  .axis {
    margin-left: 48px;
    position: relative;
    height: 14px;
    margin-bottom: 0.25rem;
  }
  .axis-label {
    position: absolute;
    font-size: 10px;
    color: var(--m3c-outline);
    white-space: nowrap;
  }
  .week-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 2px;
  }
  .week-row.sparse {
    opacity: 0.5;
  }
  .week-label {
    font-size: 10px;
    color: var(--m3c-on-surface-variant);
    min-width: 40px;
    text-align: right;
    white-space: nowrap;
  }
  .cells {
    display: flex;
    flex: 1;
    height: 16px;
    border-radius: 4px;
    overflow: hidden;
  }
  .cell {
    flex: 1;
    background: color-mix(
      in oklab,
      var(--m3c-primary) calc(var(--f, 0) * 100%),
      var(--m3c-surface-container-high)
    );
  }
  .cell.untracked {
    background: repeating-linear-gradient(
      45deg,
      transparent 0,
      transparent 2px,
      var(--m3c-outline-variant) 2px,
      var(--m3c-outline-variant) 4px
    );
    opacity: 0.5;
  }
  .empty {
    text-align: center;
    color: var(--m3c-outline);
    font-size: 0.875rem;
    padding: 1rem;
  }
</style>

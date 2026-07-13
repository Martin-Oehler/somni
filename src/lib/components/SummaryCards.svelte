<script lang="ts">
  import type { SummaryStat } from "../stats";
  import { percentile } from "../stats";
  import { compactDur, fmtDur } from "../time";

  let { stats }: { stats: SummaryStat[] } = $props();

  const cards = $derived(
    stats.map((s) => {
      if (!s.values.length) return { label: s.label, empty: true as const };
      const arr = s.values;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const p10 = percentile(arr, 10);
      const p90 = percentile(arr, 90);
      const mn = Math.min(...arr);
      const mx = Math.max(...arr);
      const span = mx - mn || 1;
      return {
        label: s.label,
        empty: false as const,
        mean: fmtDur(mean),
        min: compactDur(mn),
        max: compactDur(mx),
        range: `${compactDur(p10)}–${compactDur(p90)}`,
        leftPct: ((p10 - mn) / span) * 100,
        widthPct: Math.max(((p90 - p10) / span) * 100, 8),
      };
    }),
  );
</script>

<div class="summary-grid">
  {#each cards as c (c.label)}
    <div class="summary-card">
      <div class="summary-label">{c.label}</div>
      {#if c.empty}
        <div class="summary-value">—</div>
      {:else}
        <div class="summary-value">{c.mean}</div>
        <div class="bar-track">
          <span class="minmax" style:left="0">{c.min}</span>
          <span class="minmax" style:right="0">{c.max}</span>
          <div class="bar-fill" style:left="{c.leftPct}%" style:width="{c.widthPct}%"></div>
          <span class="range-label">{c.range}</span>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .summary-card {
    background: var(--m3c-surface-container-low);
    border-radius: var(--m3-shape-medium);
    padding: 0.75rem 0.75rem 1.75rem;
    overflow: hidden;
  }
  .summary-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--m3c-on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.25rem;
  }
  .summary-value {
    font-size: 1.375rem;
    font-weight: 700;
    line-height: 1.1;
    margin-bottom: 0.5rem;
  }
  .bar-track {
    position: relative;
    height: 6px;
    background: var(--m3c-surface-container-high);
    border-radius: 4px;
    margin-top: 1rem;
  }
  .bar-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--m3c-primary);
    border-radius: 4px;
    min-width: 4px;
  }
  .minmax {
    position: absolute;
    bottom: calc(100% + 2px);
    font-size: 10px;
    color: var(--m3c-outline);
    white-space: nowrap;
  }
  .range-label {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    font-size: 10px;
    color: var(--m3c-on-surface-variant);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

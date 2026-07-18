<script lang="ts">
  import { data } from "../lib/stores/data.svelte";
  import { settings } from "../lib/stores/settings.svelte";
  import { clock } from "../lib/stores/clock.svelte";
  import { ui } from "../lib/stores/ui.svelte";
  import { boundsForDay, fmtDur } from "../lib/time";
  import { computeHistory, computeSummary } from "../lib/stats";
  import SummaryCards from "../lib/components/SummaryCards.svelte";
  import Timeline from "../lib/components/Timeline.svelte";
  import Heatmap from "../lib/components/Heatmap.svelte";

  const today = $derived(boundsForDay(clock.now, settings.shared.dayStart));
  const summary = $derived(computeSummary(data.sessions, settings.shared.dayStart, today.start));
  const history = $derived(computeHistory(data.sessions, data.feedings, today.start, clock.now));

  const dateLabel = (ts: number) => {
    const d = new Date(ts);
    return {
      weekday: d.toLocaleDateString([], { weekday: "short" }),
      date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    };
  };
</script>

<div class="section-head">Last 7 days</div>
<SummaryCards stats={summary} />

<div class="section-head">History</div>
{#if !history.length}
  <div class="empty">No history yet 🌱</div>
{:else}
  <div class="history-list">
    {#each history as day (day.bounds.start)}
      {@const label = dateLabel(day.bounds.start)}
      <div class="history-row">
        <div class="history-date">
          <strong>{label.weekday}</strong>
          {label.date}
        </div>
        <div class="history-tl">
          <Timeline
            bounds={day.bounds}
            sessions={day.sessions}
            feedings={day.feedings}
            mini
            onSelect={(kind, id) => ui.openSheet({ kind, editId: id })}
            selectedId={ui.editingEntryId}
          />
        </div>
        <div class="history-stats">
          <strong>{fmtDur(day.totalSleep)}</strong>
          {#if day.napCount}avg {fmtDur(day.avgNap)}/nap{/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<div class="section-head">Sleep heatmap</div>
<Heatmap />

<style>
  .empty {
    text-align: center;
    color: var(--m3c-outline);
    font-size: 0.875rem;
    padding: 1rem;
  }
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .history-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--m3c-surface-container-low);
    border-radius: var(--m3-shape-medium);
  }
  .history-date {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--m3c-on-surface-variant);
    min-width: 42px;
    text-align: center;
    line-height: 1.3;
  }
  .history-date strong {
    display: block;
    color: var(--m3c-on-surface);
    font-size: 0.9375rem;
  }
  .history-tl {
    flex: 1;
    min-width: 0;
  }
  .history-stats {
    text-align: right;
    font-size: 10px;
    color: var(--m3c-on-surface-variant);
    min-width: 58px;
    line-height: 1.4;
  }
  .history-stats strong {
    color: var(--m3c-on-surface);
    font-size: 0.9375rem;
    display: block;
  }
</style>

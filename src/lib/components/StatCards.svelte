<script lang="ts">
  import type { DayBounds, Session } from "../types";
  import { data } from "../stores/data.svelte";
  import { clock } from "../stores/clock.svelte";
  import { fmtDur, fmtTime } from "../time";

  let { today, todaySessions }: { today: DayBounds; todaySessions: Session[] } = $props();

  const sleepToday = $derived.by(() => {
    const now = clock.now;
    let total = 0;
    for (const s of todaySessions) {
      total += Math.max(0, Math.min(s.end ?? now, today.end) - Math.max(s.start, today.start));
    }
    const elapsed = Math.max(0, Math.min(now, today.end) - today.start);
    return { total, awake: Math.max(0, elapsed - total) };
  });

  const lastFeed = $derived.by(() => {
    if (!data.feedings.length) return null;
    const last = data.feedings.reduce((a, f) => (f.ts > a.ts ? f : a));
    return { ago: fmtDur(clock.now - last.ts), at: fmtTime(last.ts) };
  });
</script>

<div class="stat-row">
  <div class="stat-card" data-accent="sleep">
    <div class="stat-label">Sleep today</div>
    <div class="stat-value">{fmtDur(sleepToday.total)}</div>
    <div class="stat-sub">{fmtDur(sleepToday.awake)} awake</div>
  </div>
  <div class="stat-card" data-accent="feed">
    <div class="stat-label">Last feed</div>
    <div class="stat-value">{lastFeed ? lastFeed.ago : "—"}</div>
    <div class="stat-sub">{lastFeed ? `at ${lastFeed.at}` : ""}</div>
  </div>
</div>

<style>
  .stat-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .stat-card {
    background: var(--m3c-surface-container-low);
    border-radius: var(--m3-shape-medium);
    padding: 0.75rem;
  }
  .stat-card[data-accent="sleep"] {
    border-left: 3px solid var(--m3c-primary);
  }
  .stat-card[data-accent="feed"] {
    border-left: 3px solid var(--m3c-tertiary);
  }
  .stat-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--m3c-on-surface-variant);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.25rem;
  }
  .stat-value {
    font-size: 1.375rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .stat-sub {
    font-size: 0.75rem;
    color: var(--m3c-on-surface-variant);
    margin-top: 0.25rem;
    min-height: 1em;
  }
</style>

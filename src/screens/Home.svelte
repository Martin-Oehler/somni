<script lang="ts">
  import { Button, Icon } from "m3-svelte";
  import iconHistory from "@ktibow/iconset-material-symbols/history-rounded";
  import { data } from "../lib/stores/data.svelte";
  import { settings } from "../lib/stores/settings.svelte";
  import { clock } from "../lib/stores/clock.svelte";
  import { ui } from "../lib/stores/ui.svelte";
  import { boundsForDay } from "../lib/time";
  import { buildProjections } from "../lib/projection";
  import HeroCard from "../lib/components/HeroCard.svelte";
  import StatCards from "../lib/components/StatCards.svelte";
  import Timeline from "../lib/components/Timeline.svelte";
  import EntryList from "../lib/components/EntryList.svelte";

  const today = $derived(boundsForDay(clock.now, settings.shared.dayStart));
  const todaySessions = $derived(
    data.sessions.filter((s) => (s.end ?? clock.now) > today.start && s.start < today.end),
  );
  const todayFeedings = $derived(data.feedings.filter((f) => f.ts >= today.start && f.ts < today.end));
  const projections = $derived(buildProjections(data.sessions, settings.shared, today, clock.now));
</script>

<HeroCard />
<StatCards {today} {todaySessions} />

<div class="section-head">Today's timeline</div>
<div class="legend">
  <span class="legend-item"><span class="swatch sleep"></span> Sleep</span>
  <span class="legend-item"><span class="swatch projection"></span> Projected</span>
  <span class="legend-item"><span class="dot"></span> Feed</span>
</div>
<Timeline
  bounds={today}
  sessions={todaySessions}
  feedings={todayFeedings}
  {projections}
  onSelect={(kind, id) => ui.openSheet({ kind, editId: id })}
  selectedId={ui.editingEntryId}
/>

<div class="manual-actions">
  <Button variant="outlined" size="s" iconType="left" onclick={() => ui.openSheet({ kind: "sleep", editId: null })}>
    <Icon icon={iconHistory} size={18} />
    Log earlier sleep
  </Button>
  <Button variant="outlined" size="s" iconType="left" onclick={() => ui.openSheet({ kind: "feed", editId: null })}>
    <Icon icon={iconHistory} size={18} />
    Log earlier feed
  </Button>
</div>

<div class="section-head">Today's entries</div>
<EntryList sessions={todaySessions} feedings={todayFeedings} />

<style>
  .legend {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    color: var(--m3c-on-surface-variant);
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .swatch {
    width: 16px;
    height: 8px;
    border-radius: 4px;
    background: var(--m3c-primary-container);
  }
  .swatch.projection {
    background: transparent;
    border: 1.5px dashed var(--m3c-primary);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--m3c-tertiary);
  }
  .manual-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .manual-actions :global(button) {
    width: 100%;
    justify-content: center;
  }
</style>

<script lang="ts">
  import { Button, Icon } from "m3-svelte";
  import iconBedtime from "@ktibow/iconset-material-symbols/bedtime-rounded";
  import iconWake from "@ktibow/iconset-material-symbols/wb-sunny-rounded";
  import iconFeed from "@ktibow/iconset-material-symbols/water-drop-rounded";
  import { data } from "../stores/data.svelte";
  import { startSleep, endSleep, logFeedNow } from "../actions";

  const active = $derived(data.activeSession);
</script>

<!-- The two primary actions, always thumb-reachable (one-handed 3am use) -->
<div class="action-bar">
  <Button
    variant={active ? "filled" : "tonal"}
    size="m"
    iconType="left"
    onclick={() => (active ? endSleep() : startSleep())}
  >
    <Icon icon={active ? iconWake : iconBedtime} size={20} />
    {active ? "End sleep" : "Start sleep"}
  </Button>
  <div class="feed-scope">
    <Button variant="tonal" size="m" iconType="left" onclick={logFeedNow}>
      <Icon icon={iconFeed} size={20} />
      Fed now
    </Button>
  </div>
</div>

<style>
  .action-bar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    padding: 0.75rem 1rem 0.25rem;
  }
  /* Make both buttons fill their grid cell with a big tap target */
  .action-bar :global(button) {
    width: 100%;
    min-height: 3.25rem;
    justify-content: center;
    font-size: 1.0625rem;
    font-weight: 600;
  }
  .feed-scope {
    display: contents;
  }
  /* Feed actions live on the tertiary (feed pink) role */
  .feed-scope :global(button) {
    background-color: var(--m3c-tertiary-container);
    color: var(--m3c-on-tertiary-container);
  }
</style>

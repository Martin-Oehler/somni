<script lang="ts">
  import { plan } from "../stores/plan.svelte";

  // Passive entrainment read-out: one line per settled anchor. Read-only —
  // the user never manages anchors; the strip just builds trust in the rhythm.
  const dayPart = (clockMin: number): string => {
    if (clockMin < 11 * 60) return "Morning nap";
    if (clockMin < 14 * 60) return "Lunch nap";
    if (clockMin < 17 * 60) return "Afternoon nap";
    return "Evening nap";
  };
  const clockLabel = (clockMin: number): string => {
    const r = Math.round(clockMin / 5) * 5;
    return `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
  };
  // Tighter clusters earn more filled dots.
  const dots = (madMin: number): string =>
    madMin <= 15 ? "●●●" : madMin <= 30 ? "●●○" : "●○○";

  const rows = $derived(
    plan.model.anchors
      .filter((a) => a.weight >= 0.15)
      .map((a) => ({
        key: a.ordinal,
        label: dayPart(a.clockMin),
        time: clockLabel(a.clockMin),
        dots: dots(a.madMin),
      })),
  );
</script>

{#if rows.length}
  <div class="anchor-strip">
    {#each rows as row (row.key)}
      <div class="anchor-line">
        <span class="moon-ico">⚓</span>
        <span>{row.label} settling in around {row.time}</span>
        <span class="stability">{row.dots}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .anchor-strip {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0 0.25rem;
  }
  .anchor-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: var(--m3c-on-surface-variant);
  }
  .moon-ico {
    color: var(--m3c-primary);
    font-size: 0.9rem;
  }
  .stability {
    letter-spacing: 2px;
    font-size: 0.7rem;
    color: var(--m3c-primary);
  }
</style>

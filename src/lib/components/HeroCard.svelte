<script lang="ts">
  import { data } from "../stores/data.svelte";
  import { clock } from "../stores/clock.svelte";
  import { plan } from "../stores/plan.svelte";
  import { ACTIVE_CAP_MS, fmtDur, fmtTime } from "../time";

  const active = $derived(data.activeSession);

  const view = $derived.by(() => {
    const now = clock.now;
    const p = plan.plan;

    if (active) {
      const dur = now - active.start;
      // The plan's current-nap row carries the cap-aware projected wake.
      const currentNap = p.naps.find((n) => n.current);
      let sub = `Started ${fmtTime(active.start)}`;
      if (currentNap) {
        const wakeTs = currentNap.end;
        if (now < wakeTs) {
          sub = `Wake around ${fmtTime(wakeTs)} (in ${fmtDur(wakeTs - now)})`;
        } else {
          sub = `Past planned wake by ${fmtDur(now - wakeTs)}`;
        }
        if (currentNap.capped) sub += " · capped for bedtime";
      }
      return {
        state: "sleeping" as const,
        label: "Sleeping for",
        value: fmtDur(dur),
        sub,
        warn: dur > ACTIVE_CAP_MS ? `Over ${fmtDur(ACTIVE_CAP_MS)} — forgot to end this sleep?` : null,
      };
    }

    const completed = data.sessions
      .filter((s): s is typeof s & { end: number } => s.end !== null)
      .sort((a, b) => b.end - a.end);
    const awakeFor = completed.length ? `Awake for` : "Awake";
    const value = completed.length ? fmtDur(now - completed[0].end) : "—";

    // Next-nap guidance from the plan.
    const nextNap = p.naps.find((n) => !n.current);
    let sub = completed.length ? `Last sleep ended ${fmtTime(completed[0].end)}` : "";
    let warn: string | null = null;
    if (p.phase === "night") {
      sub = `Winding down · expected night ~${fmtDur(p.expectedNightMin * 60_000)}`;
    } else if (nextNap && p.nextWindow) {
      sub = `Next nap ~${fmtTime(nextNap.start)} · window ${fmtTime(p.nextWindow.earliest)}–${fmtTime(p.nextWindow.latest)}`;
      if (now > p.nextWindow.latest) warn = "Past the comfortable window — sleep soon";
    } else if (p.phase === "day" && p.showBedtime && p.bedtime !== null) {
      sub = `No more naps · bedtime ~${fmtTime(p.bedtime)}`;
    }
    return { state: "awake" as const, label: awakeFor, value, sub, warn };
  });
</script>

<section class="hero" data-state={view.state}>
  <div class="hero-label">
    {#if view.state === "sleeping"}<span class="hero-dot"></span>{/if}
    {view.label}
  </div>
  <div class="hero-value">{view.value}</div>
  {#if view.sub}<div class="hero-sub">{view.sub}</div>{/if}
  {#if view.warn}<div class="hero-warn">⚠ {view.warn}</div>{/if}
</section>

<style>
  .hero {
    background: var(--m3c-surface-container-low);
    border-radius: var(--m3-shape-extra-large);
    padding: 1.25rem 1.25rem 1.5rem;
    overflow: hidden;
  }
  .hero[data-state="sleeping"] {
    background: linear-gradient(135deg, var(--m3c-primary-container), var(--m3c-surface-container-low) 80%);
  }
  .hero-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--m3c-on-surface-variant);
    margin-bottom: 0.5rem;
  }
  .hero-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--m3c-primary);
    animation: somni-pulse 1.5s infinite;
  }
  .hero-value {
    font-size: 2.5rem;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 0.5rem;
  }
  .hero-sub {
    font-size: 0.875rem;
    color: var(--m3c-on-surface-variant);
  }
  .hero-warn {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--m3c-error);
    margin-top: 0.375rem;
  }
  @keyframes somni-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }
</style>

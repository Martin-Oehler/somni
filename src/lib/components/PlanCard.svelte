<script lang="ts">
  import { plan } from "../stores/plan.svelte";
  import { settings } from "../stores/settings.svelte";
  import { ui } from "../stores/ui.svelte";
  import { fmtDur, fmtTime, MIN_MS } from "../time";

  const p = $derived(plan.plan);
  const napLabel = (ordinal: number): string => (ordinal <= 1 ? "Nap 1" : `Nap ${ordinal}`);

  // Remaining naps (skip the in-progress one — the hero already tracks it).
  const napRows = $derived(
    p.naps
      .filter((n) => !n.current)
      .map((n) => {
        const parts: string[] = [`~${fmtDur(n.durMin * MIN_MS)}`];
        if (n.capped) parts.push("capped");
        return {
          key: `${n.ordinal}-${n.start}`,
          name: napLabel(n.ordinal),
          time: `~${fmtTime(n.start)}`,
          meta: parts.join(" · "),
          anchored: n.anchored,
        };
      }),
  );

  const budgetFill = $derived(
    p.dayBudgetMin > 0 ? Math.min(100, (p.daySleepSoFarMin / p.dayBudgetMin) * 100) : 0,
  );

  const showSetup = $derived(p.phase === "empty" && !settings.shared.birthdate);
</script>

<section class="plancard">
  {#if showSetup}
    <div class="plancard-title">Plan</div>
    <button class="setup" onclick={() => ui.navigate("settings")}>
      Set the birthdate &amp; bedtime in Settings to get an age-appropriate day plan. Tracking works
      either way.
    </button>
  {:else if p.phase === "empty"}
    <div class="plancard-title">Plan</div>
    <p class="empty">No plan yet — log today's morning wake to get started.</p>
  {:else if p.phase === "night"}
    <div class="plancard-title">Tonight</div>
    <div class="plan-row">
      <span class="plan-ico">☾</span>
      <span class="plan-name">Bedtime</span>
      <span class="plan-time">{p.bedtime !== null ? fmtTime(p.bedtime) : "—"}</span>
      <span class="plan-meta">expected night ~{fmtDur(p.expectedNightMin * MIN_MS)}</span>
    </div>
  {:else}
    <div class="plancard-title">Rest of today</div>

    {#each napRows as row (row.key)}
      <div class="plan-row">
        <span class="plan-ico">○</span>
        <span class="plan-name">{row.name}</span>
        <span class="plan-time">{row.time}</span>
        <span class="plan-meta">{row.meta}{#if row.anchored}<span class="anchor-mark"> ⚓</span>{/if}</span>
      </div>
    {/each}

    {#if p.showBedtime && p.bedtime !== null}
      <div class="plan-row" class:warn={!p.bedtimeFeasible}>
        <span class="plan-ico">☾</span>
        <span class="plan-name">Bedtime</span>
        <span class="plan-time">{fmtTime(p.bedtimeFeasible ? (p.bedtimeTarget ?? p.bedtime) : p.bedtime)}</span>
        <span class="plan-meta">
          {#if p.bedtimeFeasible}on target{:else}target {p.bedtimeTarget !== null ? fmtTime(p.bedtimeTarget) : ""} unreachable{/if}
        </span>
      </div>
    {/if}

    <div class="budget">
      <div class="budget-line">
        <span>Day sleep</span>
        <span>{fmtDur(p.daySleepSoFarMin * MIN_MS)} of ~{fmtDur(p.dayBudgetMin * MIN_MS)}</span>
      </div>
      <div class="budget-bar"><div class="budget-fill" style:width="{budgetFill}%"></div></div>
    </div>

    {#each p.hints.filter((h) => h.kind !== "overtired") as hint (hint.kind + hint.text)}
      <p class="hint" class:warn={hint.kind === "infeasible"}>{hint.text}</p>
    {/each}
  {/if}
</section>

<style>
  .plancard {
    background: var(--m3c-surface-container-low);
    border-radius: var(--m3-shape-extra-large);
    padding: 1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .plancard-title {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--m3c-on-surface-variant);
    margin-bottom: 0.35rem;
  }
  .plan-row {
    display: grid;
    grid-template-columns: 1.4rem 5.2rem auto 1fr;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.32rem 0;
    font-size: 0.95rem;
  }
  .plan-row + .plan-row {
    border-top: 1px solid var(--m3c-outline-variant);
  }
  .plan-ico {
    font-size: 0.85rem;
    text-align: center;
    color: var(--m3c-primary);
  }
  .plan-name {
    font-weight: 600;
  }
  .plan-time {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .plan-meta {
    font-size: 0.8rem;
    color: var(--m3c-on-surface-variant);
    justify-self: end;
    text-align: right;
  }
  .plan-row.warn .plan-time,
  .plan-row.warn .plan-ico {
    color: var(--m3c-error);
  }
  .plan-row.warn .plan-meta {
    color: var(--m3c-error);
    font-weight: 600;
  }
  .anchor-mark {
    color: var(--m3c-on-surface-variant);
    font-size: 0.75rem;
  }
  .budget {
    margin-top: 0.55rem;
  }
  .budget-line {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--m3c-on-surface-variant);
    margin-bottom: 0.3rem;
  }
  .budget-bar {
    height: 6px;
    border-radius: 3px;
    background: var(--m3c-surface-container-high);
    overflow: hidden;
  }
  .budget-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--m3c-primary);
    opacity: 0.75;
    transition: width 0.3s ease;
  }
  .hint {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    color: var(--m3c-on-surface-variant);
  }
  .hint.warn {
    color: var(--m3c-error);
    font-weight: 600;
  }
  .setup {
    text-align: left;
    font: inherit;
    font-size: 0.875rem;
    color: var(--m3c-primary);
    background: transparent;
    border: 1px dashed var(--m3c-primary);
    border-radius: var(--m3-shape-medium);
    padding: 0.75rem;
    cursor: pointer;
  }
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--m3c-on-surface-variant);
  }
</style>

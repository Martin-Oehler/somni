<script lang="ts">
  // Live "glance" header for the entry sheets: shows the derived values
  // (duration, relative time, wake context) that the raw datetime fields
  // can't, and doubles as a live preview while editing.
  import type { EntryKind } from "../../types";
  import { clock } from "../../stores/clock.svelte";
  import { data } from "../../stores/data.svelte";
  import { fmtDur, fmtTime } from "../../time";

  let {
    kind,
    start,
    end = null,
    isNew,
    error,
  }: {
    kind: EntryKind;
    start: number | null;
    end?: number | null;
    isNew: boolean;
    error: string | null;
  } = $props();

  const label = $derived(
    kind === "sleep" ? (isNew ? "New sleep" : "Sleep session") : isNew ? "New feeding" : "Feeding",
  );
  const valid = $derived(error === null && start !== null);
  const ongoing = $derived(kind === "sleep" && valid && end === null);

  const big = $derived(
    !valid ? "—" : kind === "feed" ? fmtTime(start!) : fmtDur((end ?? clock.now) - start!),
  );

  const ago = $derived.by(() => {
    if (!valid) return "";
    if (kind === "feed") return `${fmtDur(clock.now - start!)} ago`;
    return end !== null
      ? `ended ${fmtDur(clock.now - end)} ago`
      : `started ${fmtDur(clock.now - start!)} ago`;
  });

  // Feed context: time since the most recent completed sleep before it.
  const wakeContext = $derived.by(() => {
    if (kind !== "feed" || !valid) return "";
    let wake: number | null = null;
    for (const s of data.sessions) {
      if (s.end !== null && s.end <= start! && (wake === null || s.end > wake)) wake = s.end;
    }
    return wake !== null ? `${fmtDur(start! - wake)} after waking` : "";
  });
</script>

<header class="glance">
  <div class="row1">
    <h2 class="kicker"><span class="dot" data-kind={kind}></span>{label}</h2>
    <span class="ago">{ago}</span>
  </div>
  <div class="row2">
    <span class="big" class:invalid={!valid}>{big}</span>
    {#if ongoing}<span class="ongoing">Ongoing</span>{/if}
  </div>
  <div class="context">
    {#if kind === "sleep" && valid}
      <strong>{fmtTime(start!)}</strong>
      <span class="arrow">→</span>
      {#if end !== null}<strong>{fmtTime(end)}</strong>{:else}…{/if}
    {:else}
      {wakeContext}
    {/if}
  </div>
</header>

<style>
  .row1 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .kicker {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--m3c-on-surface-variant);
    margin: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--m3c-primary);
  }
  .dot[data-kind="feed"] {
    background: var(--m3c-tertiary);
  }
  .ago {
    font-size: 0.78rem;
    color: var(--m3c-on-surface-variant);
    text-align: right;
  }
  .row2 {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    margin-top: 0.15rem;
  }
  .big {
    font-size: 1.75rem;
    font-weight: 600;
    line-height: 1.25;
    font-variant-numeric: tabular-nums;
  }
  .big.invalid {
    color: var(--m3c-outline);
  }
  .ongoing {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    background: var(--m3c-primary-container);
    color: var(--m3c-on-primary-container);
    border-radius: var(--m3-shape-full);
    padding: 0.15rem 0.6rem;
    animation: glance-pulse 2s infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .ongoing {
      animation: none;
    }
  }
  .context {
    /* reserve the line so the header doesn't jump when context appears */
    min-height: 1.25rem;
    font-size: 0.85rem;
    color: var(--m3c-on-surface-variant);
    font-variant-numeric: tabular-nums;
  }
  .context strong {
    color: var(--m3c-on-surface);
    font-weight: 600;
  }
  @keyframes glance-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.65;
    }
  }
</style>

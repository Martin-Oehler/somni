<script lang="ts">
  import type { DayBounds, EntryKind, Feeding, Session } from "../types";
  import type { Projection } from "../projection";
  import { HOUR_MS, fmtDur, fmtTime } from "../time";
  import { clock } from "../stores/clock.svelte";

  let {
    bounds,
    sessions,
    feedings,
    projections = null,
    mini = false,
    onSelect = null,
    selectedId = null,
  }: {
    bounds: DayBounds;
    sessions: Session[];
    feedings: Feeding[];
    projections?: Projection[] | null;
    mini?: boolean;
    onSelect?: ((kind: EntryKind, id: string) => void) | null;
    selectedId?: string | null;
  } = $props();

  const span = $derived(bounds.end - bounds.start);
  const pct = (t: number): number => Math.max(0, Math.min(100, ((t - bounds.start) / span) * 100));

  const axisHours = [0, 4, 8, 12, 16, 20, 24];
  const axisLabel = (h: number): string =>
    new Date(bounds.start + h * HOUR_MS).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  interface Block {
    id: string;
    left: number;
    width: number;
    label: string | null;
    active: boolean;
    aria: string;
  }

  const sessionBlocks = $derived.by((): Block[] => {
    const now = clock.now;
    const out: Block[] = [];
    for (const s of sessions) {
      const start = Math.max(s.start, bounds.start);
      const end = Math.min(s.end ?? now, bounds.end);
      if (end <= bounds.start || start >= bounds.end) continue;
      const left = pct(start);
      const width = Math.max(pct(end) - left, mini ? 0.8 : 1.2);
      out.push({
        id: s.id,
        left,
        width,
        label: !mini && width > 5 ? fmtDur((s.end ?? now) - s.start) : null,
        active: s.end === null,
        aria: `Sleep ${fmtTime(s.start)}${s.end ? " to " + fmtTime(s.end) : ", ongoing"}`,
      });
    }
    return out;
  });

  const projectionBlocks = $derived.by((): Block[] => {
    if (!projections) return [];
    const out: Block[] = [];
    for (const p of projections) {
      const start = Math.max(p.start, bounds.start);
      const end = Math.min(p.end, bounds.end);
      if (end <= bounds.start || start >= bounds.end) continue;
      const left = pct(start);
      const width = Math.max(pct(end) - left, 1);
      out.push({
        id: `${p.start}`,
        left,
        width,
        label: !mini && width > 6 ? fmtTime(p.start) : null,
        active: false,
        aria: "",
      });
    }
    return out;
  });

  const feedDots = $derived(
    feedings
      .filter((f) => f.ts >= bounds.start && f.ts <= bounds.end)
      .map((f) => ({ id: f.id, left: pct(f.ts), aria: `Feeding at ${fmtTime(f.ts)}` })),
  );

  const nowPct = $derived(clock.now > bounds.start && clock.now < bounds.end ? pct(clock.now) : null);
</script>

<div class="tl-wrap" class:mini>
  <div class="tl-axis">
    {#each axisHours as h (h)}
      <span
        class="tl-axis-label"
        style:left="{(h / 24) * 100}%"
        style:transform={h === 0 ? "none" : h === 24 ? "translateX(-100%)" : "translateX(-50%)"}
      >
        {axisLabel(h)}
      </span>
    {/each}
  </div>
  <div class="tl-track">
    <div class="tl-bg">
      {#each Array.from({ length: 25 }, (_, h) => h) as h (h)}
        <div class="tl-tick" class:labeled={h % 4 === 0} style:left="{(h / 24) * 100}%"></div>
      {/each}
    </div>
    {#each projectionBlocks as b (b.id)}
      <div class="tl-block projection" style:left="{b.left}%" style:width="{b.width}%">
        {#if b.label}<span class="tl-block-label">{b.label}</span>{/if}
      </div>
    {/each}
    {#each sessionBlocks as b (b.id)}
      {#if onSelect}
        <button
          type="button"
          class="tl-block"
          class:active={b.active}
          class:selected={b.id === selectedId}
          style:left="{b.left}%"
          style:width="{b.width}%"
          aria-label={b.aria}
          onclick={() => onSelect?.("sleep", b.id)}
        >
          {#if b.label}<span class="tl-block-label">{b.label}</span>{/if}
        </button>
      {:else}
        <div class="tl-block static" class:active={b.active} style:left="{b.left}%" style:width="{b.width}%"></div>
      {/if}
    {/each}
    {#each feedDots as f (f.id)}
      {#if onSelect}
        <button
          type="button"
          class="tl-feed"
          class:selected={f.id === selectedId}
          style:left="{f.left}%"
          aria-label={f.aria}
          onclick={() => onSelect?.("feed", f.id)}
        ></button>
      {:else}
        <div class="tl-feed static" style:left="{f.left}%"></div>
      {/if}
    {/each}
    {#if nowPct !== null}
      <div class="tl-now" style:left="{nowPct}%"></div>
    {/if}
  </div>
</div>

<style>
  .tl-axis {
    position: relative;
    height: 15px;
    margin-bottom: 3px;
  }
  .tl-axis-label {
    position: absolute;
    top: 0;
    font-size: 10px;
    line-height: 15px;
    color: var(--m3c-outline);
    white-space: nowrap;
  }
  .mini .tl-axis {
    height: 11px;
    margin-bottom: 2px;
  }
  .mini .tl-axis-label {
    font-size: 9px;
    line-height: 11px;
  }
  .tl-track {
    position: relative;
    width: 100%;
    height: 38px;
  }
  .mini .tl-track {
    height: 20px;
  }
  .tl-bg {
    position: absolute;
    inset: 0;
    background: var(--m3c-surface-container);
    border-radius: 8px;
    overflow: hidden;
  }
  .tl-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--m3c-outline-variant);
    opacity: 0.4;
  }
  .tl-tick.labeled {
    width: 1.5px;
    opacity: 0.9;
  }
  .tl-block {
    position: absolute;
    top: 3px;
    bottom: 3px;
    background: var(--m3c-primary-container);
    border: none;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 4px;
    padding: 0;
    cursor: pointer;
    color: var(--m3c-on-primary-container);
  }
  .tl-block.static {
    cursor: default;
  }
  /* expanded hit area for skinny blocks */
  .tl-block:not(.static)::after {
    content: "";
    position: absolute;
    inset: -8px -3px;
  }
  .tl-block:focus-visible {
    outline: 2px solid var(--m3c-primary);
    outline-offset: 1px;
  }
  /* Hover preview, mouse only — touch devices get no stale hover state. */
  @media (hover: hover) and (pointer: fine) {
    .tl-block:not(.static):not(.projection):hover {
      filter: brightness(1.12);
    }
    .tl-feed:not(.static):hover {
      filter: brightness(1.15);
      transform: translate(-50%, -50%) scale(1.25);
    }
  }
  /* Entry whose sheet is open. The sheet's <dialog> backdrop sits in the
     browser top layer, so nothing can be lifted above it — brightness +
     ring keep the entry readable through the dimming instead. */
  .tl-block.selected {
    outline: 2px solid var(--m3c-primary);
    outline-offset: 1px;
    filter: brightness(1.2);
    z-index: 2;
  }
  .tl-feed.selected {
    outline: 2px solid var(--m3c-tertiary);
    outline-offset: 2px;
    filter: brightness(1.2);
  }
  .tl-block.active {
    background: linear-gradient(90deg, var(--m3c-primary), var(--m3c-primary-container));
    animation: somni-pulse 2s infinite;
  }
  .tl-block.projection {
    background: transparent;
    border: 1.5px dashed var(--m3c-primary);
    opacity: 0.55;
    cursor: default;
    pointer-events: none;
    color: var(--m3c-primary);
  }
  .tl-block-label {
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    padding: 0 4px;
  }
  .projection .tl-block-label {
    font-style: italic;
  }
  .mini .tl-block {
    top: 2px;
    bottom: 2px;
  }
  .tl-feed {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--m3c-tertiary);
    border: 2px solid var(--m3c-surface);
    padding: 0;
    z-index: 2;
    cursor: pointer;
  }
  .tl-feed.static {
    cursor: default;
  }
  .tl-feed:not(.static)::after {
    content: "";
    position: absolute;
    inset: -12px;
  }
  .tl-feed:focus-visible {
    outline: 2px solid var(--m3c-tertiary);
    outline-offset: 2px;
  }
  .mini .tl-feed {
    width: 8px;
    height: 8px;
    border-width: 1.5px;
  }
  .tl-now {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: var(--m3c-error);
    opacity: 0.6;
    border-radius: 1px;
    pointer-events: none;
    z-index: 3;
  }
  @keyframes somni-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.65;
    }
  }
</style>

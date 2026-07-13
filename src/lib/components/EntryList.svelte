<script lang="ts">
  import { Icon } from "m3-svelte";
  import iconBedtime from "@ktibow/iconset-material-symbols/bedtime-rounded";
  import iconFeed from "@ktibow/iconset-material-symbols/water-drop-rounded";
  import iconEdit from "@ktibow/iconset-material-symbols/edit-rounded";
  import iconDelete from "@ktibow/iconset-material-symbols/delete-rounded";
  import type { EntryKind, Feeding, Session } from "../types";
  import { clock } from "../stores/clock.svelte";
  import { ui } from "../stores/ui.svelte";
  import { deleteSession, deleteFeeding } from "../actions";
  import { fmtDur, fmtTime } from "../time";

  let { sessions, feedings }: { sessions: Session[]; feedings: Feeding[] } = $props();

  interface Entry {
    kind: EntryKind;
    id: string;
    ts: number;
    main: string;
    sub: string;
  }

  const SWIPE_THRESHOLD = 40;
  const REVEAL = 72;

  const entries = $derived.by((): Entry[] => {
    const now = clock.now;
    const list: Entry[] = [
      ...sessions.map((s) => ({
        kind: "sleep" as const,
        id: s.id,
        ts: s.start,
        main: s.end === null ? `Sleeping since ${fmtTime(s.start)}` : `${fmtTime(s.start)} – ${fmtTime(s.end)}`,
        sub: s.end === null ? "Ongoing" : fmtDur(s.end - s.start),
      })),
      ...feedings.map((f) => ({
        kind: "feed" as const,
        id: f.id,
        ts: f.ts,
        main: `Fed at ${fmtTime(f.ts)}`,
        sub: `${fmtDur(now - f.ts)} ago`,
      })),
    ];
    return list.sort((a, b) => b.ts - a.ts);
  });

  // Swipe-to-reveal-delete, ported from the prototype.
  let swipedId = $state<string | null>(null);
  let dragOffset = $state(0);
  let draggingId = $state<string | null>(null);
  let startX = 0;

  const touchStart = (e: TouchEvent, id: string) => {
    startX = e.touches[0].clientX;
    draggingId = id;
    dragOffset = 0;
  };
  const touchMove = (e: TouchEvent, id: string) => {
    if (draggingId !== id) return;
    const dx = e.touches[0].clientX - startX;
    if (swipedId === id) dragOffset = Math.min(0, -REVEAL + dx) + REVEAL;
    else if (dx < -10) dragOffset = Math.max(-REVEAL, dx);
  };
  const touchEnd = (e: TouchEvent, id: string) => {
    if (draggingId !== id) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (swipedId !== id && dx < -SWIPE_THRESHOLD) swipedId = id;
    else if (swipedId === id && dx > SWIPE_THRESHOLD) swipedId = null;
    draggingId = null;
    dragOffset = 0;
  };

  const rowTransform = (id: string): string => {
    if (draggingId === id && swipedId !== id) return `translateX(${dragOffset}px)`;
    if (swipedId === id) {
      const x = draggingId === id ? Math.min(0, -REVEAL + dragOffset) : -REVEAL;
      return `translateX(${x}px)`;
    }
    return "";
  };

  const remove = (entry: Entry) => {
    swipedId = null;
    if (entry.kind === "sleep") deleteSession(entry.id);
    else deleteFeeding(entry.id);
  };

  const edit = (entry: Entry) => {
    ui.openSheet({ kind: entry.kind, editId: entry.id });
  };
</script>

<div class="log-list" role="list">
  {#if !entries.length}
    <div class="log-empty">No entries today yet</div>
  {:else}
    {#each entries as entry (entry.kind + entry.id)}
      <div class="log-row" role="listitem">
        <button type="button" class="log-delete" aria-label="Delete entry" onclick={() => remove(entry)}>
          <Icon icon={iconDelete} size={22} />
        </button>
        <!-- Swipe is an enhancement only; delete/edit have real buttons. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="log-content"
          class:dragging={draggingId === entry.id}
          style:transform={rowTransform(entry.id)}
          ontouchstart={(e) => touchStart(e, entry.id)}
          ontouchmove={(e) => touchMove(e, entry.id)}
          ontouchend={(e) => touchEnd(e, entry.id)}
        >
          <span class="log-icon" data-kind={entry.kind}>
            <Icon icon={entry.kind === "sleep" ? iconBedtime : iconFeed} size={20} />
          </span>
          <div class="log-text">
            <div class="log-main">{entry.main}</div>
            <div class="log-sub">{entry.sub}</div>
          </div>
          <button type="button" class="log-edit m3-layer" aria-label="Edit entry" onclick={() => edit(entry)}>
            <Icon icon={iconEdit} size={20} />
          </button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .log-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .log-empty {
    text-align: center;
    color: var(--m3c-outline);
    font-size: 0.875rem;
    padding: 1rem 0;
  }
  .log-row {
    position: relative;
    overflow: hidden;
    border-radius: var(--m3-shape-medium);
  }
  .log-delete {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 72px;
    border: none;
    background: var(--m3c-error);
    color: var(--m3c-on-error);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 0 var(--m3-shape-medium) var(--m3-shape-medium) 0;
  }
  .log-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.25rem 0.625rem 0.75rem;
    background: var(--m3c-surface-container-low);
    border-radius: var(--m3-shape-medium);
    transition: transform 0.25s ease;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
  }
  .log-content.dragging {
    transition: none;
  }
  .log-icon {
    display: flex;
    color: var(--m3c-primary);
  }
  .log-icon[data-kind="feed"] {
    color: var(--m3c-tertiary);
  }
  .log-text {
    flex: 1;
    min-width: 0;
  }
  .log-main {
    font-size: 0.9375rem;
    font-weight: 500;
  }
  .log-sub {
    font-size: 0.75rem;
    color: var(--m3c-on-surface-variant);
    margin-top: 1px;
  }
  .log-edit {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: none;
    background: transparent;
    color: var(--m3c-on-surface-variant);
    border-radius: var(--m3-shape-full);
    cursor: pointer;
  }
</style>

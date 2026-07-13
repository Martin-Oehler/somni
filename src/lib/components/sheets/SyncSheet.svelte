<script lang="ts">
  import { Button } from "m3-svelte";
  import { sync } from "../../stores/sync.svelte";
  import { reconcile } from "../../sync/engine";
  import { fmtClock } from "../../time";

  const statusText = $derived(
    !sync.online
      ? "Offline — changes queue locally"
      : sync.status === "ok"
        ? "Synced"
        : sync.status === "pending"
          ? "Sync pending"
          : "Sync failed",
  );

  let showLog = $state(false);
</script>

<div class="sheet-body">
  <h2 class="sheet-title">Sync</h2>
  <p class="status" data-status={sync.online ? sync.status : "offline"}>{statusText}</p>
  <div class="rows">
    <div class="row"><span>Realtime</span><span>{sync.realtimeConnected ? "connected" : "off"}</span></div>
    <div class="row"><span>Queued writes</span><span>{sync.outboxDepth}</span></div>
    <div class="row"><span>Last attempt</span><span>{sync.lastAttempt ? fmtClock(sync.lastAttempt) : "—"}</span></div>
    <div class="row"><span>Last success</span><span>{sync.lastSuccess ? fmtClock(sync.lastSuccess) : "—"}</span></div>
    <div class="row"><span>Attempts since success</span><span>{sync.attemptsSinceSuccess || "—"}</span></div>
  </div>
  <div class="sheet-actions">
    <Button variant="tonal" onclick={() => void reconcile("manual")}>Sync now</Button>
    <Button variant="text" onclick={() => (showLog = !showLog)}>
      {showLog ? "Hide log" : "Show log"}
    </Button>
  </div>
  {#if showLog}
    <div class="log">
      {#if !sync.log.length}
        <div class="log-empty">No sync events yet</div>
      {:else}
        {#each sync.log as e (e.ts + e.type)}
          <div class="log-row" data-level={e.level}>
            <span class="log-time">{fmtClock(e.ts)}</span>
            <div class="log-body">
              <div class="log-type">{e.type}</div>
              {#if e.details}<div class="log-details">{e.details}</div>{/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
    <Button variant="text" onclick={() => sync.clearLog()}>Clear log</Button>
  {/if}
</div>

<style>
  .status {
    margin: 0;
    text-align: center;
    font-weight: 600;
  }
  .status[data-status="ok"] {
    color: var(--m3c-primary);
  }
  .status[data-status="pending"],
  .status[data-status="offline"] {
    color: var(--m3c-on-surface-variant);
  }
  .status[data-status="fail"] {
    color: var(--m3c-error);
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    justify-content: space-between;
    padding: 0.375rem 0;
    font-size: 0.875rem;
    border-bottom: 1px solid var(--m3c-outline-variant);
  }
  .row:last-child {
    border-bottom: none;
  }
  .row > :last-child {
    color: var(--m3c-on-surface-variant);
  }
  .log {
    max-height: 40dvh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: var(--m3c-surface-container);
    border-radius: var(--m3-shape-small);
    padding: 0.5rem;
  }
  .log-empty {
    text-align: center;
    color: var(--m3c-outline);
    font-size: 0.875rem;
    padding: 0.75rem;
  }
  .log-row {
    display: flex;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: var(--m3c-surface);
    border-radius: 6px;
    border-left: 3px solid var(--m3c-outline);
  }
  .log-row[data-level="ok"] {
    border-left-color: var(--m3c-primary);
  }
  .log-row[data-level="warn"] {
    border-left-color: var(--m3c-tertiary);
  }
  .log-row[data-level="err"] {
    border-left-color: var(--m3c-error);
  }
  .log-row[data-level="info"] {
    border-left-color: var(--m3c-outline-variant);
  }
  .log-time {
    font-size: 10px;
    color: var(--m3c-outline);
    font-family: var(--m3-font-mono, monospace);
    min-width: 60px;
    padding-top: 2px;
  }
  .log-body {
    flex: 1;
    min-width: 0;
  }
  .log-type {
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .log-details {
    font-size: 0.75rem;
    color: var(--m3c-on-surface-variant);
    word-break: break-word;
  }
</style>

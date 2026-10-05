<script lang="ts">
  import { Icon } from "m3-svelte";
  import iconCloudDone from "@ktibow/iconset-material-symbols/cloud-done-rounded";
  import iconCloudOff from "@ktibow/iconset-material-symbols/cloud-off-rounded";
  import iconSync from "@ktibow/iconset-material-symbols/sync-rounded";
  import iconSyncProblem from "@ktibow/iconset-material-symbols/sync-problem-rounded";
  import { sync } from "../stores/sync.svelte";
  import { ui } from "../stores/ui.svelte";

  // A pull in flight outranks ok/pending/fail: until it finishes, the data
  // on screen is the local cache and may be out of date.
  const displayStatus = $derived(
    !sync.online ? "offline" : sync.pulling ? "syncing" : sync.status,
  );

  const statusIcon = $derived(
    displayStatus === "offline"
      ? iconCloudOff
      : displayStatus === "ok"
        ? iconCloudDone
        : displayStatus === "fail"
          ? iconSyncProblem
          : iconSync,
  );

  const statusLabel = $derived(
    {
      offline: "Offline",
      syncing: "Syncing",
      ok: "Synced",
      pending: "Sync pending",
      fail: "Sync failed",
    }[displayStatus],
  );
</script>

<header class="top-bar">
  <div class="inner">
    <span class="title">Somni</span>
    <button
      type="button"
      class="sync-btn m3-layer"
      data-status={displayStatus}
      aria-label="Sync status: {statusLabel}"
      aria-busy={displayStatus === "syncing"}
      onclick={() => ui.openSheet({ kind: "sync" })}
    >
      <Icon icon={statusIcon} size={22} />
    </button>
  </div>
  {#if displayStatus === "syncing"}
    <div class="pull-bar" role="progressbar" aria-label="Syncing latest data"></div>
  {/if}
</header>

<style>
  .top-bar {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--m3c-surface);
    padding-top: env(safe-area-inset-top, 0px);
    user-select: none;
    -webkit-user-select: none;
  }
  .inner {
    max-width: 40rem;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    min-height: 4rem;
  }
  .title {
    font-size: 1.375rem;
    font-weight: 500;
  }
  .sync-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border: none;
    border-radius: var(--m3-shape-full);
    background: transparent;
    color: var(--m3c-on-surface-variant);
    cursor: pointer;
    position: relative;
  }
  .sync-btn[data-status="pending"] {
    color: var(--m3c-primary);
    animation: somni-pulse 1.4s infinite;
  }
  .sync-btn[data-status="syncing"] {
    color: var(--m3c-primary);
  }
  .sync-btn[data-status="syncing"] :global(svg) {
    animation: somni-spin 1s linear infinite;
  }
  .sync-btn[data-status="fail"] {
    color: var(--m3c-error);
  }
  .sync-btn[data-status="offline"] {
    color: var(--m3c-outline);
  }

  /* Indeterminate bar pinned to the header's bottom edge, overlaying
     content instead of shifting it. */
  .pull-bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    overflow: hidden;
    background: var(--m3c-secondary-container);
  }
  .pull-bar::before {
    content: "";
    position: absolute;
    inset: 0;
    width: 40%;
    border-radius: var(--m3-shape-full);
    background: var(--m3c-primary);
    animation: somni-slide 1.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
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
  @keyframes somni-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes somni-slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(250%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sync-btn[data-status="syncing"] :global(svg) {
      animation: none;
    }
    .pull-bar::before {
      animation: none;
      width: 100%;
      opacity: 0.6;
    }
  }
</style>

<script lang="ts">
  import { Icon } from "m3-svelte";
  import iconCloudDone from "@ktibow/iconset-material-symbols/cloud-done-rounded";
  import iconCloudOff from "@ktibow/iconset-material-symbols/cloud-off-rounded";
  import iconSync from "@ktibow/iconset-material-symbols/sync-rounded";
  import iconSyncProblem from "@ktibow/iconset-material-symbols/sync-problem-rounded";
  import { sync } from "../stores/sync.svelte";
  import { ui } from "../stores/ui.svelte";

  const statusIcon = $derived(
    !sync.online ? iconCloudOff : sync.status === "ok" ? iconCloudDone : sync.status === "pending" ? iconSync : iconSyncProblem,
  );
</script>

<header class="top-bar">
  <div class="inner">
    <span class="title">Somni</span>
    <button
      type="button"
      class="sync-btn m3-layer"
      data-status={sync.online ? sync.status : "offline"}
      aria-label="Sync status"
      onclick={() => ui.openSheet({ kind: "sync" })}
    >
      <Icon icon={statusIcon} size={22} />
    </button>
  </div>
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
  .sync-btn[data-status="fail"] {
    color: var(--m3c-error);
  }
  .sync-btn[data-status="offline"] {
    color: var(--m3c-outline);
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

<script lang="ts">
  import { BottomSheet } from "m3-svelte";
  import { ui } from "../stores/ui.svelte";
  import SleepSheet from "./sheets/SleepSheet.svelte";
  import FeedSheet from "./sheets/FeedSheet.svelte";
  import SyncSheet from "./sheets/SyncSheet.svelte";
  import ExportSheet from "./sheets/ExportSheet.svelte";
  import ImportSheet from "./sheets/ImportSheet.svelte";
</script>

{#if ui.sheet}
  {@const sheet = ui.sheet}
  <BottomSheet close={() => ui.closeSheet()}>
    {#if sheet.kind === "sleep"}
      <SleepSheet editId={sheet.editId} />
    {:else if sheet.kind === "feed"}
      <FeedSheet editId={sheet.editId} />
    {:else if sheet.kind === "sync"}
      <SyncSheet />
    {:else if sheet.kind === "export"}
      <ExportSheet />
    {:else if sheet.kind === "import"}
      <ImportSheet />
    {/if}
  </BottomSheet>
{/if}

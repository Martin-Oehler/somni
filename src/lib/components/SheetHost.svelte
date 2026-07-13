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
  <BottomSheet close={() => ui.closeSheet()}>
    {#if ui.sheet.kind === "sleep"}
      <SleepSheet editId={ui.sheet.editId} />
    {:else if ui.sheet.kind === "feed"}
      <FeedSheet editId={ui.sheet.editId} />
    {:else if ui.sheet.kind === "sync"}
      <SyncSheet />
    {:else if ui.sheet.kind === "export"}
      <ExportSheet />
    {:else if ui.sheet.kind === "import"}
      <ImportSheet />
    {/if}
  </BottomSheet>
{/if}

<script lang="ts">
  import { NavCMLX, NavCMLXItem, Snackbar, LoadingIndicator, snackbar } from "m3-svelte";
  import iconHome from "@ktibow/iconset-material-symbols/home-rounded";
  import iconHomeOutline from "@ktibow/iconset-material-symbols/home-outline-rounded";
  import iconTrends from "@ktibow/iconset-material-symbols/monitoring-rounded";
  import iconSettings from "@ktibow/iconset-material-symbols/settings-rounded";
  import iconSettingsOutline from "@ktibow/iconset-material-symbols/settings-outline-rounded";
  import { ui } from "./lib/stores/ui.svelte";
  import { auth, initAuth } from "./lib/stores/auth.svelte";
  import { settings } from "./lib/stores/settings.svelte";
  import { data } from "./lib/stores/data.svelte";
  import { clock } from "./lib/stores/clock.svelte";
  import { bootFromCache, startSync } from "./lib/sync/engine";
  import { supabaseConfigured } from "./lib/sync/supabase";
  import { loadColorScheme } from "./lib/sync/local";
  import { applyColorScheme, watchSystemScheme } from "./lib/theme";
  import { startSleep, logFeedNow } from "./lib/actions";
  import TopBar from "./lib/components/TopBar.svelte";
  import ActionBar from "./lib/components/ActionBar.svelte";
  import SheetHost from "./lib/components/SheetHost.svelte";
  import Home from "./screens/Home.svelte";
  import Trends from "./screens/Trends.svelte";
  import Settings from "./screens/Settings.svelte";
  import Login from "./screens/Login.svelte";

  let booted = $state(false);
  let syncStarted = false;

  // TEMP debug probe
  let debugText = $state("");
  $effect(() => {
    const t = setInterval(() => {
      const widths: { w: number; d: string }[] = [];
      for (const el of document.querySelectorAll("*")) {
        if ((el as HTMLElement).closest(".somni-debug")) continue;
        const r = el.getBoundingClientRect();
        widths.push({ w: r.width, d: `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 40) });
      }
      widths.sort((a, b) => b.w - a.w);
      debugText =
        `iw=${window.innerWidth} doc=${document.documentElement.scrollWidth} | ` +
        widths.slice(0, 5).map((x) => `${Math.round(x.w)} ${x.d}`).join(" | ");
    }, 700);
    return () => clearInterval(t);
  });

  $effect(() => {
    if (booted) return;
    booted = true;
    settings.colorScheme = loadColorScheme();
    applyColorScheme(settings.colorScheme);
    watchSystemScheme(() => applyColorScheme(settings.colorScheme));
    bootFromCache();
    clock.start();
    ui.start();
    void initAuth();
  });

  // Start sync once a session exists (covers both cold start with a
  // persisted session and a fresh login).
  $effect(() => {
    if (auth.userEmail && !syncStarted) {
      syncStarted = true;
      startSync();
      handleLaunchAction();
    }
  });

  // PWA app shortcuts: /?action=sleep|feed (long-press launcher icon)
  const handleLaunchAction = () => {
    const action = new URLSearchParams(location.search).get("action");
    if (!action) return;
    history.replaceState(null, "", location.pathname + location.hash);
    if (action === "sleep") {
      if (!data.activeSession) {
        startSleep();
        snackbar("Sleep started");
      }
    } else if (action === "feed") {
      logFeedNow();
      snackbar("Feed logged");
    }
  };

  const navItems = [
    { screen: "home", text: "Home", icon: iconHome, iconOutline: iconHomeOutline },
    { screen: "trends", text: "Trends", icon: iconTrends, iconOutline: iconTrends },
    { screen: "settings", text: "Settings", icon: iconSettings, iconOutline: iconSettingsOutline },
  ] as const;
</script>

{#if !supabaseConfigured}
  <div class="center-page">
    <h1>Somni</h1>
    <p>
      Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code>, fill in
      <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, and rebuild.
    </p>
  </div>
{:else if !auth.ready}
  <div class="center-page">
    <LoadingIndicator aria-label="Loading" />
  </div>
{:else if !auth.userEmail && false /* TEMP smoke-test bypass */}
  <Login />
{:else}
  <TopBar />
  <main class="app-content">
    {#if ui.screen === "home"}
      <Home />
    {:else if ui.screen === "trends"}
      <Trends />
    {:else}
      <Settings />
    {/if}
  </main>
  <div class="bottom-bars">
    {#if ui.screen === "home"}
      <ActionBar />
    {/if}
    <NavCMLX variant="compact">
      {#each navItems as item (item.screen)}
        <NavCMLXItem
          variant="compact"
          icon={ui.screen === item.screen ? item.icon : item.iconOutline}
          text={item.text}
          selected={ui.screen === item.screen}
          onclick={() => ui.navigate(item.screen)}
        />
      {/each}
    </NavCMLX>
  </div>
  <SheetHost />
{/if}
<Snackbar />
<div class="somni-debug" style="position:fixed;top:0;left:0;z-index:9999;background:#c00;color:#fff;font-size:10px;padding:2px 4px;max-width:100vw;white-space:pre-wrap;">{debugText}</div>

<style>
  .center-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
  }
  .center-page code {
    font-family: var(--m3-font-mono, monospace);
    background: var(--m3c-surface-container);
    padding: 0 0.25rem;
    border-radius: 4px;
  }
</style>

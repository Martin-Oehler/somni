/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { functionsMixins } from "vite-plugin-functions-mixins";

export default defineConfig({
  plugins: [
    // Processes m3-svelte's CSS @mixin/@apply/--function() syntax (peer requirement)
    functionsMixins({ deps: ["m3-svelte"] }),
    svelte(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Somni",
        short_name: "Somni",
        description: "Baby sleep & feeding tracker",
        id: "/",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#f8f9ff",
        background_color: "#f8f9ff",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon-mono-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
        ],
        shortcuts: [
          {
            name: "Start sleep",
            short_name: "Sleep",
            url: "/?action=sleep",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Log feed",
            short_name: "Feed",
            url: "/?action=feed",
            icons: [{ src: "/icon-192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Page loads are network-first: a precached index.html outlives the deployment it came from,
        // and once Vercel no longer serves the hashed bundles it references, a refresh renders a blank
        // page. So the precache must not answer navigations ('/' would otherwise map to index.html)…
        navigateFallback: null,
        directoryIndex: null,
        runtimeCaching: [
          // Supabase API calls must NEVER be cached — stale API responses cause sync bugs.
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\//,
            handler: "NetworkOnly",
          },
          // …instead, online loads always get the HTML of the live deployment. Offline (or a network
          // slower than 3 s) falls back to the last page served, then to the precached shell.
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "somni-pages",
              networkTimeoutSeconds: 3,
              precacheFallback: { fallbackURL: "index.html" },
            },
          },
          // Bundles referenced by a network-fetched page may be newer than this worker's precache;
          // keep them so that page also works offline. Hashed filenames → safe to cache forever.
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "somni-assets",
              expiration: { maxEntries: 60 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

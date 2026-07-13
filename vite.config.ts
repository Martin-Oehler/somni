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
        navigateFallback: "index.html",
        // Supabase API calls must NEVER be cached — stale API responses cause sync bugs.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\//,
            handler: "NetworkOnly",
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

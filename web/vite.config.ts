import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}${process.env.GITHUB_SHA ? "+" + process.env.GITHUB_SHA.slice(0, 7) : ""}`),
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../supabase/functions/_shared", import.meta.url)),
    },
  },
  server: { fs: { allow: [".."] } },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 900 },
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "badge-72.png"],
      manifest: {
        name: "Spotty",
        short_name: "Spotty",
        description: "Pflege, Protokoll und Akte für Spotty",
        lang: "de",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#eef2f1",
        theme_color: "#ffffff",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
});

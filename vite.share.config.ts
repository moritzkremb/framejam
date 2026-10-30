import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };

/**
 * The share page (`www.framejam.ai/v/<token>`), built from the same review components as the local app. FrameJam
 * Cloud hosts the output: `dist/share/index.html` is served for every `/v/<token>` (with the Convex URL filled in)
 * and `dist/share/assets` at `/v/assets`. Not part of the npm package.
 *
 *   npm run build:share
 *   VITE_CONVEX_URL=http://127.0.0.1:3210 npm run dev:share   # http://localhost:2402/v/<token>
 */
export default defineConfig({
  root: path.resolve(__dirname, "share"),
  base: "/v/",
  publicDir: false,
  envDir: __dirname,
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src/web") },
  },
  build: { outDir: path.resolve(__dirname, "dist/share"), emptyOutDir: true, assetsInlineLimit: 0 },
  server: { port: 2402, fs: { allow: [__dirname] } },
});

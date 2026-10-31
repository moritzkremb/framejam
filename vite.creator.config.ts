import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };

/**
 * The creator review page (`app.framejam.ai/p/<id>`), built from the same review components as the local app. FrameJam
 * Cloud hosts the output: `dist/creator/index.html` is served to signed-in creators for every `/p/<id>` (with the
 * Convex URL filled in) and `dist/creator/assets` at `/p/assets`. Not part of the npm package.
 *
 *   npm run build:creator
 */
export default defineConfig({
  root: path.resolve(__dirname, "creator"),
  base: "/p/",
  publicDir: false,
  envDir: __dirname,
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src/web") },
  },
  build: { outDir: path.resolve(__dirname, "dist/creator"), emptyOutDir: true, assetsInlineLimit: 0 },
  server: { port: 2403, fs: { allow: [__dirname] } },
});

import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = Number(process.env.FRAMEJAM_PORT ?? process.env.FRAMECUT_PORT ?? 2400);
const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src/web") },
  },
  build: { outDir: "dist/web", emptyOutDir: true },
  server: {
    port: 2401,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
      "/mcp": `http://127.0.0.1:${apiPort}`,
      "/vendor": `http://127.0.0.1:${apiPort}`,
    },
  },
});

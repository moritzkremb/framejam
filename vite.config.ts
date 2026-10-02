import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = Number(process.env.FRAMEJAM_PORT ?? process.env.FRAMECUT_PORT ?? 2400);

export default defineConfig({
  plugins: [react()],
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

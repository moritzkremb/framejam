import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/server/cli.ts" },
  outDir: "dist/server",
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
});

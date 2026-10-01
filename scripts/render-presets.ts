/**
 * Renders every preset's Hyperframes composition to preview.mp4 and grabs a poster frame.
 * Usage: npm run render:presets [-- <preset-id> ...]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { builtinPresetsDir } from "../src/server/paths.ts";

const HYPERFRAMES = process.env.HYPERFRAMES_BIN ?? "npx -y hyperframes@0.8.104";
const only = process.argv.slice(2);

function run(cmd: string, cwd: string) {
  const res = spawnSync(cmd, { cwd, shell: true, stdio: "inherit" });
  if (res.status !== 0) throw new Error(`Command failed (${res.status}): ${cmd}`);
}

for (const id of fs.readdirSync(builtinPresetsDir).sort()) {
  if (only.length && !only.includes(id)) continue;
  const dir = path.join(builtinPresetsDir, id);
  const compDir = path.join(dir, "composition");
  if (!fs.existsSync(path.join(compDir, "index.html"))) continue;
  const style = JSON.parse(fs.readFileSync(path.join(dir, "style.json"), "utf8"));
  const out = path.join(dir, "preview.mp4");
  console.log(`\n▶ ${id}`);
  run(`${HYPERFRAMES} lint .`, compDir);
  run(`${HYPERFRAMES} render -o "${out}" --fps 30 --crf 26 --quiet`, compDir);
  const posterAt = (style.durationSeconds ?? 6) * 0.42;
  run(`ffmpeg -loglevel error -y -ss ${posterAt} -i "${out}" -frames:v 1 -vf "scale='min(960,iw)':-2" -q:v 3 "${path.join(dir, "poster.jpg")}"`, dir);
  console.log(`  ✓ ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}

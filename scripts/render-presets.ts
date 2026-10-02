/**
 * Renders every preset's Hyperframes composition to preview.mp4 and grabs a poster frame.
 * Usage: npm run render:presets [-- <preset-id> ...]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { builtinPresetsDir } from "../src/server/paths.ts";

const HYPERFRAMES = process.env.HYPERFRAMES_BIN ?? "npx -y hyperframes@0.8.104";
/** AV1 keeps 1080p previews sharp in the detail view at roughly half the size of H.264. Safari only decodes it on M3+ Macs; elsewhere it falls back to the poster. */
const AV1 = "-c:v libsvtav1 -svtav1-params preset=4:tune=0 -crf 54 -pix_fmt yuv420p";
const only = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-presets-"));

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
  const master = path.join(tmp, `${id}.mp4`);
  console.log(`\n▶ ${id}`);
  run(`${HYPERFRAMES} lint .`, compDir);
  run(`${HYPERFRAMES} render -o "${master}" --fps 30 --crf 10 --quiet`, compDir);
  run(`ffmpeg -loglevel error -y -i "${master}" -an ${AV1} -movflags +faststart "${out}"`, dir);
  const posterAt = (style.durationSeconds ?? 6) * 0.42;
  run(`ffmpeg -loglevel error -y -ss ${posterAt} -i "${master}" -frames:v 1 -vf "scale='min(960,iw)':-2" -q:v 3 "${path.join(dir, "poster.jpg")}"`, dir);
  fs.rmSync(master);
  console.log(`  ✓ ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}
fs.rmSync(tmp, { recursive: true, force: true });

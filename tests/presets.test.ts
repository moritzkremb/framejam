import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PREVIEW_BASE_URL } from "../src/server/paths.ts";
import { PresetLibrary } from "../src/server/presets.ts";

describe("preset previews", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-presets-"));
  const style = (id: string) => JSON.stringify({ id, name: id, tagline: "", description: "", mood: [], pacing: "medium", format: "16:9" });
  const add = (dir: string, id: string, preview: boolean) => {
    fs.mkdirSync(path.join(dir, id), { recursive: true });
    fs.writeFileSync(path.join(dir, id, "style.json"), style(id));
    if (preview) fs.writeFileSync(path.join(dir, id, "preview.mp4"), "");
  };
  const builtin = path.join(root, "builtin");
  const user = path.join(root, "user");
  add(builtin, "packaged", false);
  add(builtin, "checkout", true);
  add(user, "mine", false);
  const lib = new PresetLibrary([
    { dir: builtin, builtin: true },
    { dir: user, builtin: false },
  ]);
  const previewUrl = (id: string) => lib.summary(lib.get(id)!).previewUrl;

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("streams built-in previews from the website when the package leaves them out", () => {
    expect(previewUrl("packaged")).toBe(`${PREVIEW_BASE_URL}/packaged/preview.mp4`);
  });

  it("serves a local preview when there is one", () => {
    expect(previewUrl("checkout")).toBe("/api/presets/checkout/files/preview.mp4");
  });

  it("has no preview for a user preset without one", () => {
    expect(previewUrl("mine")).toBeUndefined();
  });
});

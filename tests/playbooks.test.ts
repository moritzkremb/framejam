import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { costBadge, groupNeeds, needLabel, stylesSentence, validatePlaybook } from "../src/shared/playbooks.ts";
import type { Playbook } from "../src/shared/types.ts";
import { builtinPlaybooksDir, builtinPresetsDir, PLAYBOOK_PREVIEW_BASE_URL } from "../src/server/paths.ts";
import { PlaybookLibrary } from "../src/server/playbooks.ts";
import { samplePlaybook, writePlaybook } from "./helpers.ts";

describe("playbook library", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-playbooks-"));
  const builtin = path.join(root, "builtin");
  const user = path.join(root, "user");
  writePlaybook(builtin, samplePlaybook("packaged"));
  writePlaybook(builtin, samplePlaybook("checkout"), { preview: true });
  writePlaybook(builtin, samplePlaybook("shared", { name: "Built-in" }));
  writePlaybook(user, samplePlaybook("shared", { name: "Mine" }));
  writePlaybook(user, { id: "broken", name: "Broken" });
  writePlaybook(builtin, samplePlaybook("styled", { styles: "parts", stylesNote: "captions", featuredStyles: [{ id: "pop" }, { id: "mono" }] }));
  writePlaybook(user, samplePlaybook("mine-styled", { styles: "all", featuredStyles: [{ id: "pop" }] }));
  for (const [dir, file] of [
    [path.join(builtin, "styled", "previews", "pop"), "poster.jpg"],
    [path.join(builtin, "styled", "previews", "mono"), "preview.mp4"],
  ]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), "");
  }
  const lib = new PlaybookLibrary([
    { dir: builtin, builtin: true },
    { dir: user, builtin: false },
  ]);

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("skips invalid playbooks and lets a user playbook replace a built-in one", () => {
    expect(lib.all().map((p) => p.playbook.id).sort()).toEqual(["checkout", "mine-styled", "packaged", "shared", "styled"]);
    expect(lib.get("shared")!.playbook.name).toBe("Mine");
  });

  it("streams built-in previews from the website unless there's a local one", () => {
    expect(lib.summary(lib.get("packaged")!).previewUrl).toBe(`${PLAYBOOK_PREVIEW_BASE_URL}/packaged/preview.mp4`);
    expect(lib.summary(lib.get("checkout")!).previewUrl).toBe("/api/playbooks/checkout/files/preview.mp4");
    expect(lib.summary(lib.get("shared")!).previewUrl).toBeUndefined();
  });

  it("gives each style made for a playbook its own example", () => {
    expect(lib.summary(lib.get("styled")!).featuredStyles).toEqual([
      {
        id: "pop",
        previewUrl: `${PLAYBOOK_PREVIEW_BASE_URL}/styled/previews/pop/preview.mp4`,
        posterUrl: "/api/playbooks/styled/files/previews/pop/poster.jpg",
      },
      { id: "mono", previewUrl: "/api/playbooks/styled/files/previews/mono/preview.mp4", posterUrl: undefined },
    ]);
    expect(lib.summary(lib.get("mine-styled")!).featuredStyles).toEqual([{ id: "pop", previewUrl: undefined, posterUrl: undefined }]);
    expect(lib.summary(lib.get("packaged")!).featuredStyles).toEqual([]);
    expect(lib.files(lib.get("styled")!)).not.toContain(path.join("previews", "pop", "poster.jpg"));
  });

  it("lists files and reads the method", () => {
    const p = lib.get("packaged")!;
    expect(lib.files(p)).toEqual(["SKILL.md", "playbook.json", path.join("scripts", "run.sh")]);
    expect(lib.skillText(p)).toContain("Do the thing.");
  });

  it("searches name, tagline, bring and tags", () => {
    expect(lib.list("clip").length).toBe(5);
    expect(lib.list("nothing like this")).toEqual([]);
  });
});

describe("playbook helpers", () => {
  it("validates the fields that the UI relies on", () => {
    expect(validatePlaybook(samplePlaybook("ok"))).toEqual([]);
    expect(validatePlaybook(samplePlaybook("parts", { styles: "parts" }))).toContain("stylesNote is required when styles is parts");
    expect(validatePlaybook(samplePlaybook("svc", { needs: [{ name: "Music", where: "service" }] }))).toContain(
      "needs[0].cost must be free, free tier or paid",
    );
    expect(validatePlaybook(samplePlaybook("Bad Id"))).toContain("id must be lowercase letters, numbers and dashes");
    expect(validatePlaybook(samplePlaybook("feat", { featuredStyles: [{ id: "pop" }, { id: "pop" }] }))).toContain("featuredStyles has pop twice");
    expect(validatePlaybook(samplePlaybook("feat", { featuredStyles: [{ id: "pop", settings: [] as never }] }))).toContain(
      "featuredStyles[0].settings must be an object",
    );
    expect(validatePlaybook(samplePlaybook("feat", { styles: "none", featuredStyles: [{ id: "pop" }] }))).toContain(
      "featuredStyles needs styles other than none",
    );
  });

  it("counts required paid tools for the badge", () => {
    expect(costBadge([{ name: "ffmpeg", where: "computer" }])).toBe("Free to run");
    expect(
      costBadge([
        { name: "Music", where: "service", cost: "paid" },
        { name: "Images", where: "service", cost: "paid" },
        { name: "Voice", where: "service", cost: "paid", optional: true },
      ]),
    ).toBe("Needs 2 paid tools");
  });

  it("writes each need as one plain line", () => {
    expect(needLabel({ name: "A voice", where: "service", cost: "paid", optional: true, examples: ["ElevenLabs", "OpenAI TTS"] })).toBe(
      "A voice (paid, optional), e.g. ElevenLabs, OpenAI TTS",
    );
    expect(needLabel({ name: "ffmpeg", where: "computer" })).toBe("ffmpeg (free)");
    expect(needLabel({ name: "Engine", where: "included" })).toBe("Engine");
  });

  it("groups needs in a fixed order and drops empty groups", () => {
    const groups = groupNeeds([
      { name: "Music", where: "service", cost: "paid" },
      { name: "Engine", where: "included" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Included", "Your accounts"]);
  });

  it("says in one sentence how a style combines", () => {
    expect(stylesSentence({ styles: "parts", stylesNote: "captions and inserts" }, "Acid Chrome")).toBe("Acid Chrome sets the captions and inserts.");
    expect(stylesSentence({ styles: "none" })).toBe("This playbook has its own look. Styles aren't used.");
  });
});

describe("built-in playbooks", () => {
  const lib = new PlaybookLibrary([{ dir: builtinPlaybooksDir, builtin: true }]);
  const dirs = fs.existsSync(builtinPlaybooksDir)
    ? fs.readdirSync(builtinPlaybooksDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  it("reads the preview's shape from the poster, not the format", () => {
    const shape = (id: string) => lib.summary(lib.get(id)!).previewShape;
    expect(lib.get("clean-cut")!.playbook.format).toBe("any");
    expect(shape("clean-cut")).toBe("tall");
    expect(shape("founder-launch")).toBe("wide");
    expect(shape("cartoon-music-video")).toBe("wide");
  });

  it.each(dirs)("%s is valid, has its method and a poster", (dir) => {
    const raw = JSON.parse(fs.readFileSync(path.join(builtinPlaybooksDir, dir, "playbook.json"), "utf8")) as Playbook;
    expect(validatePlaybook(raw)).toEqual([]);
    expect(raw.id).toBe(dir);
    const p = lib.get(dir)!;
    expect(lib.skillText(p).length).toBeGreaterThan(500);
    expect(fs.existsSync(path.join(p.dir, "poster.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(p.dir, "preview.mp4"))).toBe(false);
    for (const s of raw.featuredStyles ?? []) {
      expect(fs.existsSync(path.join(builtinPresetsDir, s.id, "style.json")), `${dir}: style ${s.id}`).toBe(true);
      expect(fs.existsSync(path.join(p.dir, "previews", s.id, "poster.jpg")), `${dir}: poster for ${s.id}`).toBe(true);
      expect(fs.existsSync(path.join(p.dir, "previews", s.id, "preview.mp4"))).toBe(false);
    }
  });
});

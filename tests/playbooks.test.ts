import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { costBadge, groupNeeds, needLabel, stylesSentence, validatePlaybook } from "../src/shared/playbooks.ts";
import type { Playbook } from "../src/shared/types.ts";
import { builtinPlaybooksDir, PLAYBOOK_PREVIEW_BASE_URL } from "../src/server/paths.ts";
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
  const lib = new PlaybookLibrary([
    { dir: builtin, builtin: true },
    { dir: user, builtin: false },
  ]);

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("skips invalid playbooks and lets a user playbook replace a built-in one", () => {
    expect(lib.all().map((p) => p.playbook.id).sort()).toEqual(["checkout", "packaged", "shared"]);
    expect(lib.get("shared")!.playbook.name).toBe("Mine");
  });

  it("streams built-in previews from the website unless there's a local one", () => {
    expect(lib.summary(lib.get("packaged")!).previewUrl).toBe(`${PLAYBOOK_PREVIEW_BASE_URL}/packaged/preview.mp4`);
    expect(lib.summary(lib.get("checkout")!).previewUrl).toBe("/api/playbooks/checkout/files/preview.mp4");
    expect(lib.summary(lib.get("shared")!).previewUrl).toBeUndefined();
  });

  it("lists files and reads the method", () => {
    const p = lib.get("packaged")!;
    expect(lib.files(p)).toEqual(["SKILL.md", "playbook.json", path.join("scripts", "run.sh")]);
    expect(lib.skillText(p)).toContain("Do the thing.");
  });

  it("searches name, tagline, bring and tags", () => {
    expect(lib.list("clip").length).toBe(3);
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

  it.each(dirs)("%s is valid, has its method and a poster", (dir) => {
    const raw = JSON.parse(fs.readFileSync(path.join(builtinPlaybooksDir, dir, "playbook.json"), "utf8")) as Playbook;
    expect(validatePlaybook(raw)).toEqual([]);
    expect(raw.id).toBe(dir);
    const p = lib.get(dir)!;
    expect(lib.skillText(p).length).toBeGreaterThan(500);
    expect(fs.existsSync(path.join(p.dir, "poster.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(p.dir, "preview.mp4"))).toBe(false);
  });
});

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { GET_GUIDE_DESCRIPTION, parseGuide } from "../src/core/guides.ts";
import { loadGuides } from "../src/server/guides.ts";
import { skillFile } from "../src/server/skill.ts";

describe("skill guides", () => {
  const guides = loadGuides();
  const skill = fs.readFileSync(skillFile, "utf8");

  it("every guide has a title and a when-to-read line, and the skill and tool name each one", () => {
    expect(guides.length).toBeGreaterThan(0);
    for (const g of guides) {
      expect(skill).toContain(`| \`${g.topic}\` |`);
      expect(GET_GUIDE_DESCRIPTION).toContain(g.topic);
    }
  });

  it("every guide the skill points to exists", () => {
    const named = [...skill.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
    expect(named.sort()).toEqual(guides.map((g) => g.topic).sort());
  });

  it("keeps the core short enough for web chats", () => {
    expect(Buffer.byteLength(skill)).toBeLessThan(10_000);
  });

  it("refuses a guide without its header lines", () => {
    expect(() => parseGuide("bad", "no title here")).toThrow(/needs a "# Title" line/);
  });
});

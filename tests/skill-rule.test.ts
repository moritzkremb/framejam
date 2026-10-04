import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { cursorRule, ruleFile, skillFile } from "../scripts/sync-rule.ts";

describe("agent instructions", () => {
  it("keeps the Cursor rule in sync with SKILL.md (run npm run sync:rule)", () => {
    expect(fs.readFileSync(ruleFile, "utf8")).toBe(cursorRule(fs.readFileSync(skillFile, "utf8")));
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLOUD_MCP_URL, currentPluginFiles, pluginRoot, startSkill } from "../scripts/sync-plugin.ts";
import { packageRoot } from "../src/server/paths.ts";

const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(packageRoot, file), "utf8"));

describe("plugin for Claude Code and ChatGPT", () => {
  it("is up to date with package.json and the skill (run npm run sync:plugin)", () => {
    for (const [file, text] of Object.entries(currentPluginFiles())) {
      expect(fs.readFileSync(path.join(pluginRoot, file), "utf8"), file).toBe(text);
    }
  });

  it("runs the matching npm release of the server in both apps", () => {
    const { version } = readJson("package.json");
    const args = ["-y", `framejam@${version}`, "--stdio"];
    expect(readJson("plugin/.claude-plugin/plugin.json").mcpServers.framejam.args).toEqual(args);
    expect(readJson("plugin/mcp.json").mcpServers.framejam.args).toEqual(args);
  });

  it("lists FrameJam Cloud's remote server next to the local one, for chats that can't run it", () => {
    expect(readJson("plugin/.claude-plugin/plugin.json").mcpServers["framejam-cloud"]).toEqual({ type: "http", url: CLOUD_MCP_URL });
    expect(readJson("plugin/mcp.json").mcpServers["framejam-cloud"]).toEqual({ type: "streamable-http", url: CLOUD_MCP_URL });
  });

  it("tells the agent to prefer the local tools and not ask local users to sign in", () => {
    const skill = fs.readFileSync(path.join(pluginRoot, "skills", "start", "SKILL.md"), "utf8");
    expect(skill).toContain("## Which FrameJam you have");
    expect(skill).toMatch(/If `framejam-cloud` is listed too, don't use it and don't ask the user\s+to sign in to it/);
    expect(skill).toContain("## On FrameJam Cloud");
    expect(skill).toMatch(/Don't wait: on this server `wait_for_feedback` returns right away/);
  });

  it("names the main skill start, so the command reads /framejam:start", () => {
    expect(startSkill("---\nname: framejam\ndescription: x\n---\nbody")).toBe(
      "---\nname: start\ndescription: x\nmetadata:\n  internal: true\n---\nbody",
    );
  });

  it("hides its skills from `npx skills add`, which would install them next to the framejam skill", () => {
    for (const skill of ["start", "playbook", "style"]) {
      const text = fs.readFileSync(path.join(pluginRoot, "skills", skill, "SKILL.md"), "utf8");
      expect(text, skill).toMatch(/^---\n[\s\S]*\nmetadata:\n {2}internal: true\n---\n/);
    }
  });

  it("is listed in both marketplaces", () => {
    expect(readJson(".claude-plugin/marketplace.json").plugins).toEqual([expect.objectContaining({ name: "framejam", source: "./plugin" })]);
    expect(readJson(".agents/plugins/marketplace.json").plugins).toEqual([
      expect.objectContaining({ name: "framejam", source: { source: "local", path: "./plugin" } }),
    ]);
  });
});

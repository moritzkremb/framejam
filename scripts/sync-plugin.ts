/**
 * Writes the generated files of the FrameJam plugin in `plugin/` from package.json and the main skill, so the plugin
 * never drifts from a release. `npm run sync:plugin`; `npm version` runs it; tests/plugin.test.ts fails when it's stale.
 *
 * One folder serves both apps. Claude Code reads `.claude-plugin/plugin.json`; ChatGPT (Work and Codex) reads the
 * portable `plugin.json` and `mcp.json`. Both read `skills/`. The MCP server is pinned to the same npm release, so
 * the skill and the tools always match. The repo lists the plugin in `.claude-plugin/marketplace.json` (Claude) and
 * `.agents/plugins/marketplace.json` (ChatGPT).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { packageRoot } from "../src/server/paths.ts";
import { skillFile } from "../src/server/skill.ts";

export const pluginRoot = path.join(packageRoot, "plugin");

const DESCRIPTION =
  "Make videos with your agent: pick a style or a playbook, then comment on the render at a time or a spot in the frame and get the next version. Works with any video tool. Runs on your computer.";
const about = {
  author: { name: "Moritz Kremb", url: "https://www.framejam.ai" },
  homepage: "https://www.framejam.ai",
  repository: "https://github.com/moritzkremb/framejam",
  license: "MIT",
  keywords: ["video", "review", "storyboard", "motion graphics", "hyperframes", "remotion"],
};

/**
 * The main skill, renamed so the plugin's command reads `/framejam:start` instead of `/framejam:framejam`. Marked
 * internal because `npx skills add moritzkremb/framejam` also reads the plugin's skills through the Claude marketplace
 * file and would otherwise install them as loose skills next to `framejam`.
 */
export function startSkill(skill: string): string {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  if (!match || !/^name: framejam$/m.test(match[1]!)) throw new Error("SKILL.md frontmatter has no `name: framejam`");
  const frontmatter = `${match[1]!.replace(/^name: framejam$/m, "name: start")}\nmetadata:\n  internal: true`;
  return `---\n${frontmatter}\n---\n${skill.slice(match[0].length)}`;
}

const json = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;

/** Every generated file, keyed by its path in `plugin/`. */
export function pluginFiles(version: string, skill: string): Record<string, string> {
  const server = { command: "npx", args: ["-y", `framejam@${version}`, "--stdio"] };
  return {
    ".claude-plugin/plugin.json": json({
      name: "framejam",
      displayName: "FrameJam",
      version,
      description: DESCRIPTION,
      ...about,
      mcpServers: { framejam: server },
    }),
    "plugin.json": json({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "framejam",
      version,
      description: DESCRIPTION,
      ...about,
      extensions: {
        "com.openai": {
          interface: {
            displayName: "FrameJam",
            shortDescription: "Make videos with your agent and review them frame by frame",
            longDescription: DESCRIPTION,
            developerName: "Moritz Kremb",
            category: "Productivity",
            websiteURL: "https://www.framejam.ai",
            defaultPrompt: [
              "Use FrameJam to make a 10-second launch video for my app.",
              "Use FrameJam to let me pick a style for a short explainer.",
            ],
            brandColor: "#D4FF3A",
            composerIcon: "./assets/icon.png",
            logo: "./assets/icon.png",
          },
        },
      },
    }),
    "mcp.json": json({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { framejam: { type: "stdio", ...server } },
    }),
    "skills/start/SKILL.md": startSkill(skill),
  };
}

export function currentPluginFiles() {
  const { version } = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version: string };
  return pluginFiles(version, fs.readFileSync(skillFile, "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  for (const [file, text] of Object.entries(currentPluginFiles())) {
    const full = path.join(pluginRoot, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  console.log(`wrote ${path.relative(packageRoot, pluginRoot)}/`);
}

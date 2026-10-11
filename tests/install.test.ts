import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  addToCodex,
  addToCursor,
  detectApps,
  findCli,
  install,
  removeFromCodex,
  removeFromCursor,
  removeOldSkill,
  resolveCommand,
  turnOnClaudeAutoUpdate,
} from "../src/server/install.ts";
import { packageRoot } from "../src/server/paths.ts";

const cmd = ["npx", "-y", "framejam", "--stdio"];

describe("framejam install", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-install-"));
  const home = (name: string) => {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    return path.join(root, name);
  };
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("adds framejam to Cursor's mcp.json and keeps the other servers", () => {
    const h = home("cursor");
    fs.mkdirSync(path.join(h, ".cursor"));
    fs.writeFileSync(path.join(h, ".cursor/mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    addToCursor(cmd, h);
    addToCursor(cmd, h);
    expect(JSON.parse(fs.readFileSync(path.join(h, ".cursor/mcp.json"), "utf8"))).toEqual({
      mcpServers: { other: { command: "x" }, framejam: { command: "npx", args: ["-y", "framejam", "--stdio"] } },
    });
  });

  it("creates mcp.json when there is none, and leaves a broken one alone", () => {
    const h = home("cursor-new");
    addToCursor(cmd, h);
    expect(JSON.parse(fs.readFileSync(path.join(h, ".cursor/mcp.json"), "utf8")).mcpServers.framejam.command).toBe("npx");
    fs.writeFileSync(path.join(h, ".cursor/mcp.json"), "{ // comment\n}");
    expect(() => addToCursor(cmd, h)).toThrow(/isn't valid JSON/);
    expect(fs.readFileSync(path.join(h, ".cursor/mcp.json"), "utf8")).toBe("{ // comment\n}");
  });

  it("replaces only the framejam section in Codex's config.toml", () => {
    const h = home("codex");
    fs.mkdirSync(path.join(h, ".codex"));
    const file = path.join(h, ".codex/config.toml");
    fs.writeFileSync(
      file,
      'model = "o3"\n\n[mcp_servers.framejam]\ncommand = "old"\n\n[mcp_servers.framejam.env]\nA = "1"\n\n[mcp_servers.github]\ncommand = "gh"\n',
    );
    addToCodex(cmd, h);
    addToCodex(cmd, h);
    expect(fs.readFileSync(file, "utf8")).toBe(
      'model = "o3"\n\n[mcp_servers.github]\ncommand = "gh"\n\n[mcp_servers.framejam]\ncommand = "npx"\nargs = ["-y","framejam","--stdio"]\n',
    );
  });

  it("finds the apps that are set up in the home folder", () => {
    const h = home("detect");
    fs.mkdirSync(path.join(h, ".cursor"));
    fs.mkdirSync(path.join(h, ".codex"));
    expect(detectApps(h).filter((a) => a !== "claude")).toEqual(["cursor", "codex"]);
  });

  it("points desktop apps at npx next to node when node isn't a system install", () => {
    const bin = home("nvm/bin");
    fs.writeFileSync(path.join(bin, "npx"), "");
    expect(resolveCommand(cmd, path.join(bin, "node"), "darwin")).toEqual([path.join(bin, "npx"), "-y", "framejam", "--stdio"]);
    expect(resolveCommand(cmd, "/opt/homebrew/bin/node", "darwin")).toEqual(cmd);
    expect(resolveCommand(cmd, path.join(bin, "node"), "win32")).toEqual(cmd);
  });
});

describe("framejam install with the plugin", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-plugin-install-"));
  const originalPath = process.env.PATH;
  afterEach(() => {
    process.env.PATH = originalPath;
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const oldSkill = (dir: string) => write(path.join(dir, "SKILL.md"), "---\nname: framejam\n---\n");

  /** Fake claude and codex commands that log their arguments, first on the PATH. */
  const fakeClis = (h: string) => {
    const bin = path.join(h, "bin");
    for (const name of ["claude", "codex"]) {
      write(path.join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${path.join(h, "calls.log")}"\n`);
      fs.chmodSync(path.join(bin, name), 0o755);
    }
    process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
    return () => fs.readFileSync(path.join(h, "calls.log"), "utf8").trim().split("\n");
  };

  it("installs the plugin in each app and removes the setup from before plugins", () => {
    const h = path.join(root, "all");
    const calls = fakeClis(h);
    write(path.join(h, ".claude/settings.json"), JSON.stringify({ extraKnownMarketplaces: { framejam: { source: { source: "github", repo: "moritzkremb/framejam" } } } }));
    write(path.join(h, ".cursor/mcp.json"), JSON.stringify({ mcpServers: { framejam: { command: "npx" }, other: { command: "x" } } }));
    write(path.join(h, ".codex/config.toml"), 'model = "o3"\n\n[mcp_servers.framejam]\ncommand = "npx"\n');
    for (const dir of [".claude/skills/framejam", ".agents/skills/framejam", ".cursor/skills/framejam"]) oldSkill(path.join(h, dir));
    write(path.join(h, ".agents/skills/other/SKILL.md"), "---\nname: other\n---\n");

    const steps = install({
      apps: ["claude", "codex", "cursor"],
      plugin: { source: "moritzkremb/framejam", dir: path.join(packageRoot, "plugin") },
      mcpCommand: cmd,
      skillSource: "moritzkremb/framejam",
      home: h,
    });

    expect(steps.slice(0, 3)).toEqual([
      { ok: true, text: "Installed the FrameJam plugin in Claude Code (it updates on its own)" },
      { ok: true, text: "Installed the FrameJam plugin in ChatGPT (Work and Codex)" },
      { ok: true, text: "Installed the FrameJam plugin in Cursor" },
    ]);
    expect(calls()).toEqual([
      "claude plugin marketplace add moritzkremb/framejam",
      "claude plugin marketplace update framejam",
      "claude plugin install framejam@framejam",
      "claude plugin update framejam@framejam",
      "claude mcp remove -s user framejam",
      "codex plugin marketplace add moritzkremb/framejam",
      "codex plugin marketplace upgrade framejam",
      "codex plugin add framejam@framejam",
    ]);
    expect(JSON.parse(fs.readFileSync(path.join(h, ".claude/settings.json"), "utf8")).extraKnownMarketplaces.framejam.autoUpdate).toBe(true);
    expect(fs.existsSync(path.join(h, ".cursor/plugins/local/framejam/plugin.json"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(h, ".cursor/mcp.json"), "utf8"))).toEqual({ mcpServers: { other: { command: "x" } } });
    expect(fs.readFileSync(path.join(h, ".codex/config.toml"), "utf8")).toBe('model = "o3"\n');
    for (const dir of [".claude/skills/framejam", ".agents/skills/framejam", ".cursor/skills/framejam"]) {
      expect(fs.existsSync(path.join(h, dir)), dir).toBe(false);
    }
    expect(fs.existsSync(path.join(h, ".agents/skills/other"))).toBe(true);
  });

  it("leaves Cursor to the Claude Code plugin when Claude Code has it, so Cursor doesn't list FrameJam twice", () => {
    const h = path.join(root, "via-claude");
    fakeClis(h);
    write(path.join(h, ".claude/plugins/installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "framejam@framejam": [{ scope: "user" }] } }));
    write(path.join(h, ".cursor/plugins/local/framejam/plugin.json"), "{}");
    const steps = install({
      apps: ["cursor"],
      plugin: { source: "moritzkremb/framejam", dir: path.join(packageRoot, "plugin") },
      mcpCommand: cmd,
      skillSource: "moritzkremb/framejam",
      home: h,
    });
    expect(steps[0]).toEqual({ ok: true, text: "Cursor uses the FrameJam plugin from Claude Code" });
    expect(fs.existsSync(path.join(h, ".cursor/plugins/local/framejam"))).toBe(false);
  });

  it("finds the claude command inside the Claude desktop app, newest version first", () => {
    const h = path.join(root, "desktop");
    process.env.PATH = "/nonexistent";
    const bin = (v: string) => path.join(h, "Library/Application Support/Claude/claude-code", v, "abc/claude.app/Contents/MacOS/claude");
    write(bin("2.1.9"), "");
    write(bin("2.1.295"), "");
    expect(findCli("claude", h)).toBe(bin("2.1.295"));
    expect(findCli("claude", path.join(root, "nothing"))).toBeUndefined();
  });

  it("only removes skill folders that are FrameJam's, and leaves a broken settings file alone", () => {
    const h = path.join(root, "safe");
    write(path.join(h, "mine/SKILL.md"), "---\nname: framejam\n---\n");
    write(path.join(h, "theirs/SKILL.md"), "---\nname: framejam-extras\n---\n");
    expect(removeOldSkill(path.join(h, "mine"))).toBe(true);
    expect(removeOldSkill(path.join(h, "theirs"))).toBe(false);
    expect(removeOldSkill(path.join(h, "missing"))).toBe(false);
    write(path.join(h, ".claude/settings.json"), "{ not json");
    expect(turnOnClaudeAutoUpdate(h)).toBe(false);
    expect(fs.readFileSync(path.join(h, ".claude/settings.json"), "utf8")).toBe("{ not json");
    expect(removeFromCursor(h)).toBe(false);
    expect(removeFromCodex(h)).toBe(false);
  });
});

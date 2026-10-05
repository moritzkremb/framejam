import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { addToCodex, addToCursor, detectApps, resolveCommand } from "../src/server/install.ts";

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

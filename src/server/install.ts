import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type App = "cursor" | "claude" | "codex";
export const APPS: { id: App; label: string; skillsAgent: string }[] = [
  { id: "cursor", label: "Cursor", skillsAgent: "cursor" },
  { id: "claude", label: "Claude Code", skillsAgent: "claude-code" },
  { id: "codex", label: "Codex", skillsAgent: "codex" },
];
export const isApp = (s: string): s is App => APPS.some((a) => a.id === s);
const label = (app: App) => APPS.find((a) => a.id === app)!.label;

/** What to do once install is done: agent apps only load new MCP servers when they start. */
export const NEXT_STEP: Record<App, string> = {
  cursor: "If the framejam tools don't show up, turn framejam on in Cursor Settings → MCP or reload the window.",
  claude: "Restart Claude Code (quit it and run claude again) so the framejam tools load.",
  codex: "Restart the MCP servers in Codex (Settings → MCP servers → Restart) so the framejam tools load.",
};

const onPath = (bin: string) =>
  (process.env.PATH ?? "").split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, bin)));

export function detectApps(home = os.homedir()): App[] {
  return APPS.map((a) => a.id).filter((app) =>
    app === "claude" ? onPath("claude") || fs.existsSync(path.join(home, ".claude")) : fs.existsSync(path.join(home, `.${app}`)),
  );
}

/**
 * Desktop apps launch MCP servers without the user's shell profile, so `npx` from nvm, fnm or Volta isn't on their
 * PATH. Point at the binary next to the running node in that case; system installs keep the portable name.
 */
export function resolveCommand(cmd: string[], nodePath = process.execPath, platform = process.platform): string[] {
  const [bin, ...args] = cmd;
  if (platform === "win32" || (bin !== "npx" && bin !== "node")) return cmd;
  const dir = path.dirname(nodePath);
  if (["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"].includes(dir)) return cmd;
  const full = path.join(dir, bin!);
  return fs.existsSync(full) ? [full, ...args] : cmd;
}

/** Adds (or replaces) the framejam entry in ~/.cursor/mcp.json, keeping every other server. */
export function addToCursor(command: string[], home = os.homedir()): string {
  const file = path.join(home, ".cursor", "mcp.json");
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8");
    try {
      config = text.trim() ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${file} isn't valid JSON, so I left it alone. Add this under "mcpServers": ${cursorEntry(command)}`);
    }
  }
  const [bin, ...args] = command;
  config.mcpServers = { ...config.mcpServers, framejam: { command: bin, args } };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}

const cursorEntry = ([bin, ...args]: string[]) => JSON.stringify({ framejam: { command: bin, args } });

/** Adds (or replaces) [mcp_servers.framejam] in ~/.codex/config.toml without touching the rest of the file. */
export function addToCodex(command: string[], home = os.homedir()): string {
  const file = path.join(home, ".codex", "config.toml");
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : [];
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const header = line.trim().match(/^\[\[?\s*([^\]]+?)\s*\]\]?/)?.[1];
    if (header) skipping = header === "mcp_servers.framejam" || header.startsWith("mcp_servers.framejam.");
    if (!skipping) kept.push(line);
  }
  while (kept.length && !kept.at(-1)!.trim()) kept.pop();
  const [bin, ...args] = command;
  const block = ["[mcp_servers.framejam]", `command = ${JSON.stringify(bin)}`, `args = ${JSON.stringify(args)}`];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${[...kept, ...(kept.length ? [""] : []), ...block].join("\n")}\n`);
  return file;
}

function addToClaude(command: string[]): string {
  if (!onPath("claude")) throw new Error(`The claude command isn't installed. Run: claude mcp add -s user framejam -- ${command.join(" ")}`);
  spawnSync("claude", ["mcp", "remove", "-s", "user", "framejam"], { stdio: "ignore" });
  const res = spawnSync("claude", ["mcp", "add", "-s", "user", "framejam", "--", ...command], { encoding: "utf8" });
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || "claude mcp add failed").trim());
  return "Claude Code (user scope)";
}

function installSkill(source: string, apps: App[]) {
  const agents = apps.map((app) => APPS.find((a) => a.id === app)!.skillsAgent);
  const npx = resolveCommand(["npx"])[0]!;
  const res = spawnSync(npx, ["-y", "skills", "add", source, "-g", "-a", ...agents, "-y"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
  if (res.status !== 0) {
    const tail = `${res.stderr ?? ""}${res.stdout ?? ""}`.trim().split("\n").slice(-3).join("\n");
    throw new Error(`npx skills add ${source} failed${tail ? `:\n${tail}` : ""}`);
  }
}

function checkFfmpeg(): string | undefined {
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0) return;
  return process.platform === "darwin"
    ? "ffmpeg is missing. Install it with: brew install ffmpeg"
    : process.platform === "win32"
      ? "ffmpeg is missing. Install it with: winget install ffmpeg"
      : "ffmpeg is missing. Install it with your package manager, e.g. sudo apt install ffmpeg";
}

export type Step = { ok: boolean; text: string };

/** `framejam install [apps...]`: MCP server and skill for each app, plus a dependency check. Never throws. */
export function install(opts: { apps: App[]; mcpCommand: string[]; skillSource: string }): Step[] {
  const command = resolveCommand(opts.mcpCommand);
  const steps: Step[] = [];
  const add = { cursor: addToCursor, codex: addToCodex, claude: addToClaude };
  for (const app of opts.apps) {
    try {
      const where = add[app](command).replace(os.homedir(), "~");
      steps.push({ ok: true, text: `Added the framejam MCP server to ${where}` });
    } catch (e) {
      steps.push({ ok: false, text: `${label(app)}: ${(e as Error).message}` });
    }
  }
  try {
    installSkill(opts.skillSource, opts.apps);
    steps.push({ ok: true, text: `Installed the FrameJam skill for ${opts.apps.map(label).join(", ")}` });
  } catch (e) {
    steps.push({ ok: false, text: (e as Error).message });
  }
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) steps.push({ ok: false, text: `FrameJam needs Node 22 or newer (you have ${process.versions.node}). Get it from https://nodejs.org` });
  const ffmpeg = checkFfmpeg();
  if (ffmpeg) steps.push({ ok: false, text: ffmpeg });
  return steps;
}

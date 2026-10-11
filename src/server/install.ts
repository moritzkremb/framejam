import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareVersions } from "./version.ts";

export type App = "cursor" | "claude" | "codex";
export const APPS: { id: App; label: string; skillsAgent: string }[] = [
  { id: "cursor", label: "Cursor", skillsAgent: "cursor" },
  { id: "claude", label: "Claude Code", skillsAgent: "claude-code" },
  { id: "codex", label: "ChatGPT (Codex)", skillsAgent: "codex" },
];
export const isApp = (s: string): s is App => APPS.some((a) => a.id === s);
const label = (app: App) => APPS.find((a) => a.id === app)!.label;

/** What to do once install is done: agent apps only load new plugins and MCP servers when they start. */
export const NEXT_STEP: Record<App, string> = {
  cursor: "Reload the Cursor window (Developer: Reload Window) so FrameJam loads.",
  claude: "Start a new session in Claude Code (in the terminal, quit and run claude again) so FrameJam loads.",
  codex: "Quit and reopen the ChatGPT app (or Codex) so FrameJam loads.",
};

/** The plugin's id in both marketplaces: the plugin `framejam` from the marketplace `framejam` (this GitHub repo). */
export const PLUGIN = "framejam@framejam";
const MARKETPLACE = "framejam";

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

/**
 * The app's command-line tool. The Claude and ChatGPT desktop apps ship their own copy, so users who only have the
 * desktop app don't need `claude` or `codex` on their PATH.
 */
export function findCli(app: "claude" | "codex", home = os.homedir()): string | undefined {
  if (onPath(app)) return app;
  if (app === "codex") {
    return ["/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex", "/Applications/Codex.app/Contents/Resources/codex"]
      .flatMap((p) => [p, path.join(home, p)])
      .find((p) => fs.existsSync(p));
  }
  const bundled = path.join(home, "Library", "Application Support", "Claude", "claude-code");
  const subdirs = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => !d.startsWith(".")) : []);
  for (const version of subdirs(bundled).sort((a, b) => compareVersions(b, a))) {
    for (const build of subdirs(path.join(bundled, version))) {
      const bin = path.join(bundled, version, build, "claude.app", "Contents", "MacOS", "claude");
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

function run(bin: string, args: string[]): void {
  const res = spawnSync(bin, args, { encoding: "utf8" });
  if (res.status === 0) return;
  const tail = `${res.stderr ?? ""}${res.stdout ?? ""}`.trim().split("\n").slice(-3).join("\n");
  throw new Error(`${path.basename(bin)} ${args.join(" ")} failed${tail ? `:\n${tail}` : ""}`);
}

const tryRun = (bin: string, args: string[]) => spawnSync(bin, args, { stdio: "ignore" });

// --- Plugin installs: Claude Code, ChatGPT (Work and Codex) and Cursor ---

/** Turns on background updates for the FrameJam marketplace; Claude Code leaves them off for marketplaces users add. */
export function turnOnClaudeAutoUpdate(home = os.homedir()): boolean {
  const file = path.join(home, ".claude", "settings.json");
  try {
    const settings = JSON.parse(fs.readFileSync(file, "utf8"));
    const entry = settings.extraKnownMarketplaces?.[MARKETPLACE];
    if (!entry || entry.autoUpdate === true) return Boolean(entry);
    entry.autoUpdate = true;
    fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

function installClaudePlugin(source: string, home: string): string {
  const bin = findCli("claude", home);
  if (!bin) throw new Error(`Couldn't find Claude Code. In Claude Code, run: /plugin install framejam --marketplace ${source}`);
  run(bin, ["plugin", "marketplace", "add", source]);
  tryRun(bin, ["plugin", "marketplace", "update", MARKETPLACE]);
  run(bin, ["plugin", "install", PLUGIN]);
  tryRun(bin, ["plugin", "update", PLUGIN]);
  const autoUpdate = turnOnClaudeAutoUpdate(home);
  tryRun(bin, ["mcp", "remove", "-s", "user", "framejam"]);
  removeOldSkill(path.join(home, ".claude", "skills", "framejam"));
  return `Installed the FrameJam plugin in Claude Code${autoUpdate ? " (it updates on its own)" : ""}`;
}

function installCodexPlugin(source: string, home: string): string {
  const bin = findCli("codex", home);
  if (!bin) throw new Error("Couldn't find the ChatGPT desktop app or Codex. Install one of them, then run this again.");
  run(bin, ["plugin", "marketplace", "add", source]);
  tryRun(bin, ["plugin", "marketplace", "upgrade", MARKETPLACE]);
  run(bin, ["plugin", "add", PLUGIN]);
  removeFromCodex(home);
  removeOldSkill(path.join(home, ".codex", "skills", "framejam"));
  removeOldSkill(path.join(home, ".agents", "skills", "framejam"));
  return "Installed the FrameJam plugin in ChatGPT (Work and Codex)";
}

/** True when Claude Code has the FrameJam plugin, from any marketplace (ours, or the directory's `framejam@synced`). */
export function claudeHasPlugin(home = os.homedir()): boolean {
  try {
    const file = path.join(home, ".claude", "plugins", "installed_plugins.json");
    const { plugins } = JSON.parse(fs.readFileSync(file, "utf8")) as { plugins?: Record<string, unknown[]> };
    return Object.entries(plugins ?? {}).some(([id, installs]) => id.startsWith("framejam@") && installs.length > 0);
  } catch {
    return false;
  }
}

/**
 * Cursor loads plugins from ~/.cursor/plugins/local, and also the plugins installed in Claude Code. So it gets a copy
 * of the plugin shipped in the npm package only when Claude Code doesn't have it, or Cursor would list it twice.
 */
function installCursorPlugin(pluginDir: string, home: string): string {
  const dest = path.join(home, ".cursor", "plugins", "local", "framejam");
  fs.rmSync(dest, { recursive: true, force: true });
  const viaClaude = claudeHasPlugin(home);
  if (!viaClaude) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(pluginDir, dest, { recursive: true });
  }
  removeFromCursor(home);
  removeOldSkill(path.join(home, ".cursor", "skills", "framejam"));
  removeOldSkill(path.join(home, ".agents", "skills", "framejam"));
  return viaClaude ? "Cursor uses the FrameJam plugin from Claude Code" : "Installed the FrameJam plugin in Cursor";
}

/** Removes a FrameJam skill copy from before the plugin (`npx skills add`), and nothing else. */
export function removeOldSkill(dir: string): boolean {
  try {
    const stat = fs.lstatSync(dir);
    if (!/^name: framejam$/m.test(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"))) return false;
    if (stat.isSymbolicLink()) fs.unlinkSync(dir);
    else fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// --- MCP config entries: a source checkout still uses these; plugin installs remove them ---

const cursorMcpFile = (home: string) => path.join(home, ".cursor", "mcp.json");
const codexConfigFile = (home: string) => path.join(home, ".codex", "config.toml");

function readCursorMcp(file: string): { mcpServers?: Record<string, unknown> } {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8");
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${file} isn't valid JSON, so I left it alone.`);
  }
}

/** Adds (or replaces) the framejam entry in ~/.cursor/mcp.json, keeping every other server. */
export function addToCursor(command: string[], home = os.homedir()): string {
  const file = cursorMcpFile(home);
  let config: { mcpServers?: Record<string, unknown> };
  try {
    config = readCursorMcp(file);
  } catch (e) {
    throw new Error(`${(e as Error).message} Add this under "mcpServers": ${cursorEntry(command)}`);
  }
  const [bin, ...args] = command;
  config.mcpServers = { ...config.mcpServers, framejam: { command: bin, args } };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}

const cursorEntry = ([bin, ...args]: string[]) => JSON.stringify({ framejam: { command: bin, args } });

export function removeFromCursor(home = os.homedir()): boolean {
  const file = cursorMcpFile(home);
  try {
    const config = readCursorMcp(file);
    if (!config.mcpServers?.framejam) return false;
    delete config.mcpServers.framejam;
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

/** config.toml without its [mcp_servers.framejam] tables. */
function withoutCodexEntry(text: string): string[] {
  const kept: string[] = [];
  let skipping = false;
  for (const line of text.split("\n")) {
    const header = line.trim().match(/^\[\[?\s*([^\]]+?)\s*\]\]?/)?.[1];
    if (header) skipping = header === "mcp_servers.framejam" || header.startsWith("mcp_servers.framejam.");
    if (!skipping) kept.push(line);
  }
  while (kept.length && !kept.at(-1)!.trim()) kept.pop();
  return kept;
}

/** Adds (or replaces) [mcp_servers.framejam] in ~/.codex/config.toml without touching the rest of the file. */
export function addToCodex(command: string[], home = os.homedir()): string {
  const file = codexConfigFile(home);
  const kept = withoutCodexEntry(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const [bin, ...args] = command;
  const block = ["[mcp_servers.framejam]", `command = ${JSON.stringify(bin)}`, `args = ${JSON.stringify(args)}`];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${[...kept, ...(kept.length ? [""] : []), ...block].join("\n")}\n`);
  return file;
}

export function removeFromCodex(home = os.homedir()): boolean {
  const file = codexConfigFile(home);
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, "utf8");
  const kept = withoutCodexEntry(text);
  const next = kept.length ? `${kept.join("\n")}\n` : "";
  if (next === text) return false;
  fs.writeFileSync(file, next);
  return true;
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

export interface InstallOptions {
  apps: App[];
  /**
   * Where the plugin comes from: the GitHub repo for npm installs. A source checkout passes nothing and gets the
   * MCP server entry plus the skill instead, so the apps run this checkout's build rather than the npm release.
   */
  plugin?: { source: string; dir: string };
  mcpCommand: string[];
  skillSource: string;
  home?: string;
}

/** `framejam install [apps...]`: the FrameJam plugin (or, from a checkout, MCP server and skill) for each app. Never throws. */
export function install(opts: InstallOptions): Step[] {
  const home = opts.home ?? os.homedir();
  const steps: Step[] = [];
  const attempt = (app: App, fn: () => string) => {
    try {
      steps.push({ ok: true, text: fn().replace(home, "~") });
    } catch (e) {
      steps.push({ ok: false, text: `${label(app)}: ${(e as Error).message}` });
    }
  };
  const { plugin } = opts;
  if (plugin) {
    const fns = {
      claude: () => installClaudePlugin(plugin.source, home),
      codex: () => installCodexPlugin(plugin.source, home),
      cursor: () => installCursorPlugin(plugin.dir, home),
    };
    // Claude Code first: whether it has the plugin decides what Cursor needs.
    const order: App[] = ["claude", "codex", "cursor"];
    for (const app of order.filter((a) => opts.apps.includes(a))) attempt(app, fns[app]);
  } else {
    const command = resolveCommand(opts.mcpCommand);
    const add = { cursor: () => addToCursor(command, home), codex: () => addToCodex(command, home), claude: () => addToClaude(command) };
    for (const app of opts.apps) attempt(app, () => `Added the framejam MCP server to ${add[app]()}`);
    try {
      installSkill(opts.skillSource, opts.apps);
      steps.push({ ok: true, text: `Installed the FrameJam skill for ${opts.apps.map(label).join(", ")}` });
    } catch (e) {
      steps.push({ ok: false, text: (e as Error).message });
    }
  }
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) steps.push({ ok: false, text: `FrameJam needs Node 22 or newer (you have ${process.versions.node}). Get it from https://nodejs.org` });
  const ffmpeg = checkFfmpeg();
  if (ffmpeg) steps.push({ ok: false, text: ffmpeg });
  return steps;
}

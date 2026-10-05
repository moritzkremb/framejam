import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApp } from "./app.ts";
import { createMcpServer } from "./mcp.ts";
import { APPS, type App, NEXT_STEP, detectApps, install, isApp } from "./install.ts";
import { DEFAULT_PORT, dataDir, env, setupInfo } from "./paths.ts";
import { PresetLibrary } from "./presets.ts";
import { Store } from "./store.ts";
import { VERSION, compareVersions } from "./version.ts";

const HELP = `framejam — review videos and storyboards from your coding agent, and pick style presets, over MCP

Usage:
  framejam install [app...] Set up FrameJam for cursor, claude and/or codex (default: every one found), start the UI
  framejam start            Start the web UI in the background (if it isn't running yet) and print its URL
  framejam [serve]          Start the web UI + MCP over HTTP in this terminal (http://localhost:2400, MCP at /mcp)
  framejam --stdio          MCP over stdio for Cursor / Claude Code / Codex (also hosts the web UI if the port is free)

Options:
  --port <n>        HTTP port (default ${DEFAULT_PORT}, env FRAMEJAM_PORT)
  --host <host>     Bind address (default 127.0.0.1)
  --data-dir <dir>  Where reviews and state are stored (default ~/.framejam, env FRAMEJAM_HOME)
  --browser         With start: also open the UI in the system browser
  -h, --help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    stdio: { type: "boolean", default: false },
    port: { type: "string" },
    host: { type: "string" },
    "data-dir": { type: "string" },
    browser: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const stdio = values.stdio || positionals[0] === "mcp";
// In stdio mode stdout belongs to the MCP protocol.
const log = (msg: string) => (stdio ? process.stderr : process.stdout).write(`${msg}\n`);

const port = Number(values.port ?? env("PORT") ?? DEFAULT_PORT);
const host = values.host ?? env("HOST") ?? "127.0.0.1";
if (values["data-dir"]) process.env.FRAMEJAM_HOME = values["data-dir"];
const baseUrl = (env("PUBLIC_URL") ?? `http://localhost:${port}`).replace(/\/$/, "");

interface RunningHealth {
  app?: string;
  pid?: number;
  version?: string;
  dataDir?: string;
}

async function runningHealth(): Promise<RunningHealth | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as RunningHealth;
    return body.app === "framejam" ? body : undefined;
  } catch {
    return undefined;
  }
}

async function existingFrameJam(): Promise<boolean> {
  return Boolean(await runningHealth());
}

/** True for a background `framejam serve` process, never for an agent's own `--stdio` process, which we must not stop. */
function isDetachedServe(pid: number): boolean {
  if (process.platform === "win32") return false;
  const res = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  const cmd = res.stdout ?? "";
  return res.status === 0 && /framejam|cli\.js/.test(cmd) && /\sserve(\s|$)/.test(cmd) && !cmd.includes("--stdio");
}

/**
 * A UI left running by an older version keeps serving old code, and `start` would happily reuse it. When the one on
 * the port is older than this copy, belongs to the same data dir and is a background `serve`, stop it so a fresh one
 * can start. Returns a note when it did.
 */
async function replaceOlderUI(): Promise<string | undefined> {
  const running = await runningHealth();
  if (!running?.pid) return undefined;
  if (running.version && compareVersions(running.version, VERSION) >= 0) return undefined;
  if (running.dataDir && path.resolve(running.dataDir) !== path.resolve(dataDir())) return undefined;
  if (!isDetachedServe(running.pid)) return undefined;
  try {
    process.kill(running.pid, "SIGTERM");
  } catch {
    return undefined;
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && (await existingFrameJam())) await new Promise((r) => setTimeout(r, 150));
  return `Updated the FrameJam UI${running.version ? ` from ${running.version}` : ""} to ${VERSION}.`;
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(cmd, args as string[], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
}

/**
 * Makes sure a UI is answering on the port. The server runs as a detached `framejam serve`, so it outlives the
 * agent's shell command.
 */
async function ensureRunning(): Promise<{ ok: boolean; text: string }> {
  const updated = await replaceOlderUI();
  const note = updated ? `${updated}\n` : "";
  if (await existingFrameJam()) return { ok: true, text: `FrameJam is already running at ${baseUrl}` };

  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, "server.log");
  const out = fs.openSync(logFile, "a");
  const args = [...process.execArgv, process.argv[1]!, "serve", "--port", String(port), "--host", host];
  if (values["data-dir"]) args.push("--data-dir", values["data-dir"]);
  const child = spawn(process.execPath, args, { detached: true, stdio: ["ignore", out, out], env: process.env });
  let exited = false;
  child.on("exit", () => (exited = true));
  child.unref();

  const deadline = Date.now() + 15_000;
  while (!exited && Date.now() < deadline) {
    if (await existingFrameJam()) return { ok: true, text: `${note}FrameJam is running at ${baseUrl}` };
    await new Promise((r) => setTimeout(r, 200));
  }
  if (await existingFrameJam()) return { ok: true, text: `${note}FrameJam is running at ${baseUrl}` };
  const tail = fs.readFileSync(logFile, "utf8").trim().split("\n").slice(-3).join("\n");
  return { ok: false, text: `FrameJam didn't start on port ${port}.${tail ? `\n${tail}` : ""}\nFull log: ${logFile}` };
}

/** `framejam start`: makes sure a UI is running, then prints the URL and exits. */
async function start(): Promise<never> {
  const ui = await ensureRunning();
  log(ui.text);
  if (ui.ok && values.browser) openBrowser(baseUrl);
  process.exit(ui.ok ? 0 : 1);
}

/** `framejam install [apps...]`: everything the website's install prompt used to spell out, in one command. */
async function runInstall(): Promise<never> {
  const names = positionals.slice(1);
  const unknown = names.filter((n) => !isApp(n));
  if (unknown.length) {
    log(`Unknown app: ${unknown.join(", ")}. Use cursor, claude or codex.`);
    process.exit(1);
  }
  const apps = names.length ? (names as App[]) : detectApps();
  if (!apps.length) {
    log("Couldn't find Cursor, Claude Code or Codex on this computer. Name the app, e.g. framejam install cursor");
    process.exit(1);
  }
  const setup = setupInfo();
  log(`Setting up FrameJam for ${apps.map((a) => APPS.find((x) => x.id === a)!.label).join(", ")}…\n`);
  const steps = install({ apps, mcpCommand: setup.mcpCommand, skillSource: setup.skillSource });
  const ui = await ensureRunning();
  steps.push(ui);
  for (const s of steps) log(`${s.ok ? "✓" : "✗"} ${s.text}`);
  if (ui.ok) log(`\nOpen ${baseUrl}/?installed=${apps[0]}`);
  log(
    apps.length === 1
      ? `\nLast step: ${NEXT_STEP[apps[0]!]}`
      : `\nLast step:\n${apps.map((a) => `- ${APPS.find((x) => x.id === a)!.label}: ${NEXT_STEP[a]}`).join("\n")}`,
  );
  process.exit(steps.every((s) => s.ok) ? 0 : 1);
}

if (positionals[0] === "start") await start();
if (positionals[0] === "install") await runInstall();

const store = new Store();
const presets = PresetLibrary.forStore(store.userPresetsDir);
const ctx = { store, presets, baseUrl };

function startHttp(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = serve({ fetch: createApp(ctx).fetch, port, hostname: host }, () => {
      log(`framejam UI:  ${baseUrl}`);
      log(`framejam MCP: ${baseUrl}/mcp (streamable HTTP)`);
      log(`data dir:     ${store.root}`);
      resolve(true);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") resolve(false);
      else {
        log(`framejam: HTTP server error: ${err.message}`);
        resolve(false);
      }
    });
  });
}

if (stdio) {
  const transport = new StdioServerTransport();
  await createMcpServer(ctx).connect(transport);
  if (!(await startHttp())) {
    const updated = await replaceOlderUI();
    if (updated) {
      const ui = await ensureRunning();
      log(`framejam: ${updated}\nframejam: ${ui.text}`);
    } else if (await existingFrameJam()) {
      log(`framejam: reusing the web UI already running at ${baseUrl} (shared data dir ${store.root})`);
    } else {
      log(`framejam: port ${port} is taken by another program; set FRAMEJAM_PORT to use a different port`);
    }
  }
} else {
  if (!(await startHttp())) {
    log(
      (await existingFrameJam())
        ? `framejam is already running at ${baseUrl}`
        : `Port ${port} is in use. Try: framejam --port ${port + 1}`,
    );
    process.exit(1);
  }
}

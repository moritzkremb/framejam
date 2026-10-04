import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApp } from "./app.ts";
import { createMcpServer } from "./mcp.ts";
import { DEFAULT_PORT, dataDir, env } from "./paths.ts";
import { PresetLibrary } from "./presets.ts";
import { Store } from "./store.ts";

const HELP = `framejam — review videos and storyboards from your coding agent, and pick style presets, over MCP

Usage:
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

async function existingFrameJam(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json()).app === "framejam";
  } catch {
    return false;
  }
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(cmd, args as string[], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
}

/**
 * `framejam start`: makes sure a UI is answering on the port, then prints the URL and exits. The server runs as a
 * detached `framejam serve`, so it outlives the agent's shell command.
 */
async function start(): Promise<never> {
  const done = (msg: string) => {
    log(msg);
    if (values.browser) openBrowser(baseUrl);
    process.exit(0);
  };
  if (await existingFrameJam()) done(`FrameJam is already running at ${baseUrl}`);

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
    if (await existingFrameJam()) done(`FrameJam is running at ${baseUrl}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  if (await existingFrameJam()) done(`FrameJam is running at ${baseUrl}`);
  const tail = fs.readFileSync(logFile, "utf8").trim().split("\n").slice(-3).join("\n");
  log(`FrameJam didn't start on port ${port}.${tail ? `\n${tail}` : ""}\nFull log: ${logFile}`);
  process.exit(1);
}

if (positionals[0] === "start") await start();

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
    if (await existingFrameJam()) {
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

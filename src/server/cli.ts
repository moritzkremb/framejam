import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApp } from "./app.ts";
import { createMcpServer } from "./mcp.ts";
import { DEFAULT_PORT, env } from "./paths.ts";
import { PresetLibrary } from "./presets.ts";
import { Store } from "./store.ts";

const HELP = `framejam — review Hyperframes videos and pick style presets, over MCP

Usage:
  framejam [serve]          Start the web UI + MCP over HTTP (http://localhost:4517, MCP at /mcp)
  framejam --stdio          MCP over stdio for Cursor / Claude Code (also hosts the web UI if the port is free)

Options:
  --port <n>        HTTP port (default ${DEFAULT_PORT}, env FRAMEJAM_PORT)
  --host <host>     Bind address (default 127.0.0.1)
  --data-dir <dir>  Where reviews and state are stored (default ~/.framejam, env FRAMEJAM_HOME)
  -h, --help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    stdio: { type: "boolean", default: false },
    port: { type: "string" },
    host: { type: "string" },
    "data-dir": { type: "string" },
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

const store = new Store();
const presets = PresetLibrary.forStore(store.userPresetsDir);
const ctx = { store, presets, baseUrl };

async function existingFrameJam(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json()).app === "framejam";
  } catch {
    return false;
  }
}

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

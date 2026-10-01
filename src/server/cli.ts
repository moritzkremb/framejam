import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApp } from "./app.ts";
import { createMcpServer } from "./mcp.ts";
import { DEFAULT_PORT } from "./paths.ts";
import { PresetLibrary } from "./presets.ts";
import { Store } from "./store.ts";

const HELP = `framecut — review Hyperframes videos and pick style presets, over MCP

Usage:
  framecut [serve]          Start the web UI + MCP over HTTP (http://localhost:4517, MCP at /mcp)
  framecut --stdio          MCP over stdio for Cursor / Claude Code (also hosts the web UI if the port is free)

Options:
  --port <n>        HTTP port (default ${DEFAULT_PORT}, env FRAMECUT_PORT)
  --host <host>     Bind address (default 127.0.0.1)
  --data-dir <dir>  Where reviews and state are stored (default ~/.framecut, env FRAMECUT_HOME)
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

const port = Number(values.port ?? process.env.FRAMECUT_PORT ?? DEFAULT_PORT);
const host = values.host ?? process.env.FRAMECUT_HOST ?? "127.0.0.1";
if (values["data-dir"]) process.env.FRAMECUT_HOME = values["data-dir"];
const baseUrl = (process.env.FRAMECUT_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, "");

const store = new Store();
const presets = PresetLibrary.forStore(store.userPresetsDir);
const ctx = { store, presets, baseUrl };

async function existingFramecut(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json()).app === "framecut";
  } catch {
    return false;
  }
}

function startHttp(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = serve({ fetch: createApp(ctx).fetch, port, hostname: host }, () => {
      log(`framecut UI:  ${baseUrl}`);
      log(`framecut MCP: ${baseUrl}/mcp (streamable HTTP)`);
      log(`data dir:     ${store.root}`);
      resolve(true);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") resolve(false);
      else {
        log(`framecut: HTTP server error: ${err.message}`);
        resolve(false);
      }
    });
  });
}

if (stdio) {
  const transport = new StdioServerTransport();
  await createMcpServer(ctx).connect(transport);
  if (!(await startHttp())) {
    if (await existingFramecut()) {
      log(`framecut: reusing the web UI already running at ${baseUrl} (shared data dir ${store.root})`);
    } else {
      log(`framecut: port ${port} is taken by another program; set FRAMECUT_PORT to use a different port`);
    }
  }
} else {
  if (!(await startHttp())) {
    log(
      (await existingFramecut())
        ? `framecut is already running at ${baseUrl}`
        : `Port ${port} is in use. Try: framecut --port ${port + 1}`,
    );
    process.exit(1);
  }
}

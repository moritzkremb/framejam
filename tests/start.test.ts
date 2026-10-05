import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { packageRoot } from "../src/server/paths.ts";
import { VERSION } from "../src/server/version.ts";

const run = promisify(execFile);

describe("framejam start", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-start-"));
  const port = 4900 + Math.floor(Math.random() * 300);
  const start = () =>
    run(process.execPath, ["--import", "tsx", path.join(packageRoot, "src/server/cli.ts"), "start"], {
      cwd: packageRoot,
      env: { ...process.env, FRAMEJAM_HOME: home, FRAMEJAM_PORT: String(port) },
    });
  let pid: number | undefined;

  afterAll(() => {
    if (pid) process.kill(pid);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("starts the UI in the background, prints the URL and exits; a second start reuses it", async () => {
    const first = await start();
    expect(first.stdout.trim()).toBe(`FrameJam is running at http://localhost:${port}`);

    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
    expect(health.app).toBe("framejam");
    expect(health.dataDir).toBe(home);
    pid = health.pid;
    expect(fs.existsSync(path.join(home, "server.log"))).toBe(true);

    const second = await start();
    expect(second.stdout.trim()).toBe(`FrameJam is already running at http://localhost:${port}`);
    expect((await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json())).pid).toBe(pid);
  });
});

describe("framejam start with an older UI already running", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-old-"));
  const port = 5300 + Math.floor(Math.random() * 300);
  /** Stands in for a FrameJam left running by an older install: same health shape, old version, same kind of command line. */
  const fake = path.join(home, "framejam", "cli.js");
  const children: ChildProcess[] = [];
  const health = () => fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
  const start = () =>
    run(process.execPath, ["--import", "tsx", path.join(packageRoot, "src/server/cli.ts"), "start"], {
      cwd: packageRoot,
      env: { ...process.env, FRAMEJAM_HOME: home, FRAMEJAM_PORT: String(port) },
    });
  const launchOld = async (...args: string[]) => {
    const child = spawn(process.execPath, [fake, ...args, "--port", String(port)], { stdio: "ignore" });
    children.push(child);
    for (let i = 0; i < 50; i++) {
      if (await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.ok, () => false)) return child;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("fake UI didn't start");
  };

  beforeAll(() => {
    fs.mkdirSync(path.dirname(fake), { recursive: true });
    fs.writeFileSync(
      fake,
      `const http = require("node:http");
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true, app: "framejam", version: "0.0.1", pid: process.pid, dataDir: ${JSON.stringify(home)} }));
}).listen(port, "127.0.0.1");`,
    );
  });

  afterEach(async () => {
    const live = await health().catch(() => undefined);
    if (live?.pid) process.kill(live.pid);
    for (const c of children.splice(0)) c.kill();
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

  it("stops an older background UI and starts the current one", async () => {
    const old = await launchOld("serve");
    expect((await health()).version).toBe("0.0.1");

    const out = await start();
    expect(out.stdout).toContain("Updated the FrameJam UI from 0.0.1");
    expect(out.stdout).toContain(`FrameJam is running at http://localhost:${port}`);
    const now = await health();
    expect(now.version).toBe(VERSION);
    expect(now.pid).not.toBe(old.pid);
  });

  it("never stops an older agent process (--stdio) that is hosting the UI", async () => {
    const old = await launchOld("--stdio", "serve");
    const out = await start();
    expect(out.stdout.trim()).toBe(`FrameJam is already running at http://localhost:${port}`);
    expect((await health()).pid).toBe(old.pid);
  });
});

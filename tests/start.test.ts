import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { packageRoot } from "../src/server/paths.ts";

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

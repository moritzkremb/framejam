import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { authPath, deleteAuth, readAuth, writeAuth } from "../src/server/auth.ts";
import { type CloudClient, type DevicePoll, type DeviceStart, DEFAULT_CLOUD_URL, cloudUrl, createCloudClient } from "../src/server/cloud.ts";
import { formatAccount, login, logout, shouldOpenBrowser, whoami } from "../src/server/login.ts";
import { packageRoot } from "../src/server/paths.ts";

const run = promisify(execFile);

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "framejam-auth-"));
}

const startPayload: DeviceStart = {
  userCode: "ABCD-EFGH",
  deviceCode: "dev_1",
  expiresIn: 900,
  interval: 0,
  verificationUri: "https://app.framejam.ai/activate",
  verificationUriComplete: "https://app.framejam.ai/activate?user_code=ABCD-EFGH",
};

function fakeClient(opts: {
  polls?: DevicePoll[];
  start?: DeviceStart | Error;
  whoami?: { name: string; email: string } | Error;
  revoke?: Error | { ok: true };
}): CloudClient & { calls: string[] } {
  const calls: string[] = [];
  const polls = [...(opts.polls ?? [])];
  return {
    calls,
    async start() {
      calls.push("start");
      if (opts.start instanceof Error) throw opts.start;
      return opts.start ?? startPayload;
    },
    async poll(deviceCode) {
      calls.push(`poll:${deviceCode}`);
      return polls.shift() ?? { status: "pending" };
    },
    async whoami(token) {
      calls.push(`whoami:${token}`);
      if (opts.whoami instanceof Error) throw opts.whoami;
      return opts.whoami ?? { name: "Ada Lovelace", email: "ada@example.com" };
    },
    async revoke(token) {
      calls.push(`revoke:${token}`);
      if (opts.revoke instanceof Error) throw opts.revoke;
      return opts.revoke ?? { ok: true };
    },
  };
}

describe("auth.json", () => {
  let root: string;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("reads and writes the token (and optional cloud URL)", () => {
    root = tmpRoot();
    expect(readAuth(root)).toBeUndefined();
    writeAuth({ token: "tok_1", cloudUrl: "https://example.convex.cloud" }, root);
    expect(readAuth(root)).toEqual({ token: "tok_1", cloudUrl: "https://example.convex.cloud" });
    expect(fs.statSync(authPath(root)).mode & 0o777).toBe(0o600);
    expect(deleteAuth(root)).toBe(true);
    expect(readAuth(root)).toBeUndefined();
    expect(deleteAuth(root)).toBe(false);
  });

  it("treats a missing file, empty token or bad JSON as logged out", () => {
    root = tmpRoot();
    expect(readAuth(root)).toBeUndefined();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(authPath(root), "{");
    expect(readAuth(root)).toBeUndefined();
    fs.writeFileSync(authPath(root), JSON.stringify({ cloudUrl: "https://x" }));
    expect(readAuth(root)).toBeUndefined();
  });
});

describe("cloud URL", () => {
  const keys = ["FRAMEJAM_CLOUD_URL", "FRAMEJAM_CONVEX_URL", "FRAMECUT_CLOUD_URL", "FRAMECUT_CONVEX_URL"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults to production Convex and prefers FRAMEJAM_CLOUD_URL", () => {
    for (const k of keys) delete process.env[k];
    expect(cloudUrl()).toBe(DEFAULT_CLOUD_URL);
    process.env.FRAMEJAM_CONVEX_URL = "https://from-convex.example/";
    expect(cloudUrl()).toBe("https://from-convex.example");
    process.env.FRAMEJAM_CLOUD_URL = "https://from-cloud.example/";
    expect(cloudUrl()).toBe("https://from-cloud.example");
  });
});

describe("createCloudClient", () => {
  it("posts to Convex mutation/query paths", async () => {
    const calls: { url: string; body: { path: string; args: Record<string, unknown> } }[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as { path: string; args: Record<string, unknown> };
      calls.push({ url, body });
      const value =
        body.path === "deviceAuth:start"
          ? startPayload
          : body.path === "deviceAuth:poll"
            ? { status: "approved", token: "tok_1", tokenType: "bearer" }
            : body.path === "deviceAuth:whoami"
              ? { name: "Ada", email: "ada@example.com" }
              : { ok: true };
      return new Response(JSON.stringify({ status: "success", value }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = createCloudClient("https://cloud.test", fetchFn);
    await client.start();
    await client.poll("dev_1");
    await client.whoami("tok_1");
    await client.revoke("tok_1");
    expect(calls.map((c) => [c.url, c.body.path, c.body.args])).toEqual([
      ["https://cloud.test/api/mutation", "deviceAuth:start", {}],
      ["https://cloud.test/api/mutation", "deviceAuth:poll", { deviceCode: "dev_1" }],
      ["https://cloud.test/api/query", "deviceAuth:whoami", { token: "tok_1" }],
      ["https://cloud.test/api/mutation", "deviceAuth:revoke", { token: "tok_1" }],
    ]);
  });
});

describe("login / logout / whoami", () => {
  let root: string;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("login against a mocked Convex HTTP API goes pending then approved", async () => {
    root = tmpRoot();
    let polls = 0;
    const fetchFn: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { path: string };
      if (body.path === "deviceAuth:start") {
        return Response.json({ status: "success", value: startPayload });
      }
      if (body.path === "deviceAuth:poll") {
        polls += 1;
        const value: DevicePoll =
          polls < 2 ? { status: "pending" } : { status: "approved", token: "tok_http", tokenType: "bearer" };
        return Response.json({ status: "success", value });
      }
      if (body.path === "deviceAuth:whoami") {
        return Response.json({ status: "success", value: { name: "Ada Lovelace", email: "ada@example.com" } });
      }
      return Response.json({ status: "error", errorMessage: `unexpected ${body.path}` }, { status: 400 });
    };
    const result = await login({
      client: createCloudClient("https://cloud.test", fetchFn),
      root,
      sleep: async () => {},
    });
    expect(result).toEqual({ ok: true, text: "Logged in as Ada Lovelace <ada@example.com>" });
    expect(polls).toBe(2);
    expect(readAuth(root)?.token).toBe("tok_http");
  });

  it("polls pending then approved, writes auth.json and prints whoami", async () => {
    root = tmpRoot();
    const opened: string[] = [];
    const lines: string[] = [];
    const client = fakeClient({
      polls: [{ status: "pending" }, { status: "approved", token: "tok_1", tokenType: "bearer" }],
    });
    const result = await login({
      client,
      root,
      write: (m) => lines.push(m),
      openUrl: (url) => opened.push(url),
      sleep: async () => {},
    });
    expect(result).toEqual({ ok: true, text: "Logged in as Ada Lovelace <ada@example.com>" });
    expect(lines[0]).toBe("Your code: ABCD-EFGH");
    expect(lines[1]).toBe("Open https://app.framejam.ai/activate?user_code=ABCD-EFGH");
    expect(opened).toEqual(["https://app.framejam.ai/activate?user_code=ABCD-EFGH"]);
    expect(readAuth(root)).toEqual({ token: "tok_1", cloudUrl: cloudUrl() });
    expect(client.calls.filter((c) => c.startsWith("poll:"))).toEqual(["poll:dev_1", "poll:dev_1"]);
  });

  it("fails when the code expires", async () => {
    root = tmpRoot();
    const result = await login({
      client: fakeClient({ polls: [{ status: "expired" }] }),
      root,
      sleep: async () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/expired/);
    expect(readAuth(root)).toBeUndefined();
  });

  it("logout revokes and deletes the file; a failed revoke still clears it", async () => {
    root = tmpRoot();
    writeAuth({ token: "tok_1" }, root);
    const client = fakeClient({ revoke: new Error("unknown") });
    expect(await logout({ client, root })).toEqual({ ok: true, text: "Logged out." });
    expect(client.calls).toContain("revoke:tok_1");
    expect(readAuth(root)).toBeUndefined();
    expect(await logout({ client, root })).toEqual({ ok: true, text: "Already logged out." });
    expect(client.calls.filter((c) => c.startsWith("revoke:"))).toHaveLength(1);
  });

  it("whoami without auth does not call the cloud", async () => {
    root = tmpRoot();
    const client = fakeClient({});
    expect(await whoami({ client, root })).toEqual({ ok: false, text: "Not logged in." });
    expect(client.calls).toEqual([]);
  });

  it("whoami prints the account when a token is saved", async () => {
    root = tmpRoot();
    writeAuth({ token: "tok_1" }, root);
    expect(await whoami({ client: fakeClient({}), root })).toEqual({
      ok: true,
      text: "Ada Lovelace <ada@example.com>",
    });
    expect(formatAccount({ name: "  ", email: "ada@example.com" })).toBe("ada@example.com");
  });
});

describe("shouldOpenBrowser", () => {
  it("stays closed in CI and on headless Linux", () => {
    expect(shouldOpenBrowser({ CI: "1", DISPLAY: ":0" }, "linux")).toBe(false);
    expect(shouldOpenBrowser({}, "linux")).toBe(false);
    expect(shouldOpenBrowser({ DISPLAY: ":0" }, "linux")).toBe(true);
    expect(shouldOpenBrowser({}, "darwin")).toBe(true);
  });
});

describe("framejam CLI (logged out)", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-cli-auth-"));
  afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

  const cli = (args: string[]) =>
    run(process.execPath, ["--import", "tsx", path.join(packageRoot, "src/server/cli.ts"), ...args], {
      cwd: packageRoot,
      env: { ...process.env, FRAMEJAM_HOME: home },
    }).then(
      (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
      (err: { code?: number; stdout?: string; stderr?: string }) => ({
        code: err.code ?? 1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
      }),
    );

  it("documents login, logout and whoami on --help", async () => {
    const out = await cli(["--help"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("framejam login");
    expect(out.stdout).toContain("framejam logout");
    expect(out.stdout).toContain("framejam whoami");
    expect(out.stdout).toContain("FRAMEJAM_CLOUD_URL");
    expect(out.stdout).toContain(DEFAULT_CLOUD_URL);
    expect(out.stdout).toContain("framejam start");
    expect(out.stdout).toContain("framejam install");
    expect(fs.existsSync(authPath(home))).toBe(false);
  });

  it("whoami without a login says so and leaves auth.json missing", async () => {
    const out = await cli(["whoami"]);
    expect(out.code).toBe(1);
    expect(out.stdout.trim()).toBe("Not logged in.");
    expect(fs.existsSync(authPath(home))).toBe(false);
  });

  it("logout without a login is a no-op", async () => {
    const out = await cli(["logout"]);
    expect(out.code).toBe(0);
    expect(out.stdout.trim()).toBe("Already logged out.");
  });
});

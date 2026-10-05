import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.ts";
import { createUpdateChecker, UPDATE_COMMAND } from "../src/server/update.ts";
import { VERSION, compareVersions } from "../src/server/version.ts";
import { makeFixture } from "./helpers.ts";

describe("compareVersions", () => {
  it("compares major.minor.patch numerically", () => {
    expect(compareVersions("0.1.3", "0.1.2")).toBeGreaterThan(0);
    expect(compareVersions("0.1.2", "0.1.3")).toBeLessThan(0);
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.2", "0.1.2")).toBe(0);
    expect(compareVersions("0.2.0-beta.1", "0.2.0")).toBe(0);
  });
});

describe("update notice", () => {
  let fx: ReturnType<typeof makeFixture>;
  beforeEach(() => {
    fx = makeFixture();
  });
  afterEach(() => {
    fs.rmSync(fx.root, { recursive: true, force: true });
  });

  it("reports the version in /api/health", async () => {
    const res = await createApp(fx.ctx).request("/api/health");
    expect((await res.json()).version).toBe(VERSION);
  });

  it("says outdated when npm has a newer version", async () => {
    const app = createApp({ ...fx.ctx, fetchLatestVersion: async () => "99.0.0" });
    expect(await (await app.request("/api/update")).json()).toEqual({ current: VERSION, latest: "99.0.0", outdated: true, command: UPDATE_COMMAND });
  });

  it("stays quiet when current, ahead, or when npm can't be reached", async () => {
    for (const latest of [VERSION, "0.0.1", null]) {
      const body = await (await createApp({ ...fx.ctx, fetchLatestVersion: async () => latest }).request("/api/update")).json();
      expect(body.outdated).toBe(false);
      expect(body.latest).toBe(latest);
    }
  });

  it("doesn't call the registry from a source checkout", async () => {
    const body = await (await createApp(fx.ctx).request("/api/update")).json();
    expect(body).toEqual({ current: VERSION, latest: null, outdated: false, command: UPDATE_COMMAND });
  });

  it("asks the registry only once per cache window", async () => {
    let calls = 0;
    const check = createUpdateChecker(async () => (calls++, "99.0.0"));
    await check();
    await check();
    expect(calls).toBe(1);
  });
});

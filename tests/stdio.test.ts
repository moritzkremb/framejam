import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packageRoot } from "../src/server/paths.ts";
import { fixturePreset, parse, type ToolResult } from "./helpers.ts";

// Same launch path Cursor and Claude Code use: `framecut --stdio` as a child process.
describe("stdio transport (how Cursor and Claude Code launch framecut)", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "framecut-stdio-"));
  const port = 4600 + Math.floor(Math.random() * 300);
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: "stdio-test", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", path.join(packageRoot, "src/server/cli.ts"), "--stdio"],
        cwd: packageRoot,
        env: { ...process.env, FRAMECUT_HOME: home, FRAMECUT_PORT: String(port) } as Record<string, string>,
        stderr: "pipe",
      }),
    );
  });

  afterAll(async () => {
    await client?.close();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("serves MCP on stdio and hosts the review UI on the HTTP port", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(8);

    const opened = parse(
      (await client.callTool({
        name: "open_review",
        arguments: { title: "stdio teaser", videoPath: path.join(fixturePreset, "preview.mp4") },
      })) as ToolResult,
    );
    expect(opened.url).toBe(`http://localhost:${port}/review/${opened.reviewId}`);

    let health: { app?: string } = {};
    for (let i = 0; i < 40 && health.app !== "framecut"; i++) {
      health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json()).catch(() => ({}));
      if (health.app !== "framecut") await new Promise((r) => setTimeout(r, 100));
    }
    expect(health.app).toBe("framecut");
    const review = await fetch(`http://127.0.0.1:${port}/api/reviews/${opened.reviewId}`).then((r) => r.json());
    expect(review.title).toBe("stdio teaser");
  });
});

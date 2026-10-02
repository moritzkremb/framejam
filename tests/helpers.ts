import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, type McpContext } from "../src/server/mcp.ts";
import { builtinPresetsDir } from "../src/server/paths.ts";
import { PresetLibrary } from "../src/server/presets.ts";
import { Store } from "../src/server/store.ts";

export const BASE_URL = "http://localhost:2400";
export const fixturePreset = path.join(builtinPresetsDir, "swiss-editorial");

export interface ToolResult {
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
  isError?: boolean;
}

export function parse(result: ToolResult) {
  return JSON.parse(result.content.find((c) => c.type === "text")!.text!);
}

/** Fresh data dir plus an agent "project" with a composition and a render. */
export function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-test-"));
  const store = new Store(path.join(root, "data"));
  const project = path.join(root, "project");
  fs.cpSync(path.join(fixturePreset, "composition"), path.join(project, "composition"), { recursive: true });
  fs.mkdirSync(path.join(project, "renders"));
  const video = path.join(project, "renders", "v1.mp4");
  fs.copyFileSync(path.join(fixturePreset, "preview.mp4"), video);
  const ctx: McpContext = {
    store,
    presets: PresetLibrary.forStore(store.userPresetsDir),
    baseUrl: BASE_URL,
    waitSeconds: 2,
    pollMs: 20,
    progressEveryMs: 100,
  };
  return { root, store, project, video, compositionDir: path.join(project, "composition"), ctx };
}

export async function connectClient(ctx: McpContext) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(ctx);
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  const call = (name: string, args: Record<string, unknown> = {}, opts?: Parameters<Client["callTool"]>[2]) =>
    client.callTool({ name, arguments: args }, undefined, opts) as Promise<ToolResult>;
  return { client, call, close: () => client.close() };
}

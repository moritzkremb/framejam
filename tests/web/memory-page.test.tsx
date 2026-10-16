// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Memory } from "@/lib/api";
import { MemoryPage } from "@/pages/memory-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const at = "2026-01-01T00:00:00.000Z";
const memory = (over: Partial<Memory>): Memory => ({ id: "mem_1", scope: "me", text: "", confidence: "confident", sources: [], createdAt: at, updatedAt: at, ...over });

let root: Root | null = null;
let host: HTMLElement;
let memories: Memory[];
let calls: string[];

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const id = url.split("/").pop();
      if (init?.method === "DELETE") memories = memories.filter((m) => m.id !== id);
      const body = url === "/api/memory" ? { memories, projects: { rev_a: "Launch teaser" } } : {};
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function render() {
  root = createRoot(host);
  act(() =>
    root!.render(
      <MemoryRouter>
        <MemoryPage />
      </MemoryRouter>,
    ),
  );
  for (let i = 0; i < 5; i++) await act(async () => {});
}

describe("Memory page", () => {
  it("explains itself when there's nothing yet", async () => {
    memories = [];
    await render();
    expect(host.querySelector('[data-testid="memory-empty"]')?.textContent).toContain("remember that");
  });

  it("lists your memories and each client's, with hints and where they came from", async () => {
    memories = [
      memory({ id: "mem_1", text: "Hard cuts only", sources: [{ reviewId: "rev_a", commentId: "c1" }] }),
      memory({ id: "mem_2", scope: "client", client: "Acme", text: "Logo bottom right", confidence: "tentative" }),
      memory({ id: "mem_3", scope: "client", client: "acme", text: "Never on red" }),
    ];
    await render();

    const sections = [...host.querySelectorAll("section")].map((s) => ({
      name: s.querySelector("h2")?.textContent,
      items: [...s.querySelectorAll('[data-testid="memory"] .body')].map((b) => b.textContent),
    }));
    expect(sections).toEqual([
      { name: "You", items: ["Hard cuts only"] },
      { name: "Acme", items: ["Logo bottom right", "Never on red"] },
    ]);
    const [hardCuts, logo] = host.querySelectorAll('[data-testid="memory"]');
    expect(hardCuts!.querySelector("a")?.getAttribute("href")).toBe("/review/rev_a");
    expect(hardCuts!.textContent).not.toContain("Hint");
    expect(logo!.textContent).toContain("Hint");
  });
});

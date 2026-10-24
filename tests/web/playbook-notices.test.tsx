// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type CatalogStatus, type PlaybookSummary } from "@/lib/api";
import { PlaybookDetailPage } from "@/pages/playbook-detail-page";
import { PlaybooksPage } from "@/pages/playbooks-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function summary(id: string, extra: Partial<PlaybookSummary> = {}): PlaybookSummary {
  return {
    id,
    name: id,
    tagline: "In, out.",
    description: "A test playbook.",
    version: "1.0.0",
    creator: { id: "test", name: "Test" },
    bring: ["A clip"],
    get: "A video",
    format: "16:9",
    project: "any",
    needs: [{ name: "ffmpeg", where: "computer" }],
    styles: "all",
    steps: ["Cut it"],
    skill: "SKILL.md",
    builtin: true,
    source: "bundled",
    previewShape: "wide",
    hasPreview: false,
    featuredStyles: [],
    examples: [],
    ...extra,
  };
}

const playbooks = [
  summary("bundled-one"),
  summary("from-catalog", { source: "catalog", version: "1.1.0" }),
  summary("mine", { builtin: false, source: "user", newerVersion: "1.2.0" }),
];

let host: HTMLElement;
let root: Root;

async function render(node: React.ReactNode, at: string) {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[at]}>{node}</MemoryRouter>);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal("fetch", async () => new Response("null", { status: 200, headers: { "content-type": "application/json" } }));
  vi.spyOn(api, "playbooks").mockResolvedValue({ playbooks });
  vi.spyOn(api, "playbook").mockImplementation(async (id) => ({ playbook: playbooks.find((p) => p.id === id)! }));
  vi.spyOn(api, "presets").mockResolvedValue({ presets: [] });
  vi.spyOn(api, "activePick").mockResolvedValue(null);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const catalog = (extra: Partial<CatalogStatus> = {}) => vi.spyOn(api, "catalog").mockResolvedValue({ enabled: true, url: "https://x.test/v1", ...extra });
const list = () => render(<PlaybooksPage />, "/playbooks");
const detail = (id: string) =>
  render(
    <Routes>
      <Route path="/playbooks/:id" element={<PlaybookDetailPage />} />
    </Routes>,
    `/playbooks/${id}`,
  );
const text = (selector: string) => [...host.querySelectorAll(selector)].map((n) => n.textContent);

describe("Playbooks list", () => {
  it("marks updated copies and the user's copy that has a newer version", async () => {
    catalog({ checkedAt: "2026-11-02T17:00:00.000Z" });
    await list();
    expect(text('[data-testid="playbook-card"]')).toHaveLength(3);
    expect(text('[data-testid="playbook-updated"]')).toEqual(["Updated from framejam.ai"]);
    expect(text('[data-testid="playbook-update"]')).toEqual(["Version 1.2.0 is available"]);
    expect(host.querySelector('[data-testid="playbook-update"]')!.getAttribute("title")).toBe(
      "Your copy is 1.0.0. Version 1.2.0 is available; remove ~/.framejam/playbooks/mine to use it.",
    );
  });

  it("says when framejam.ai was last checked, or why it couldn't be", async () => {
    catalog({ checkedAt: "2026-11-02T17:00:00.000Z" });
    await list();
    expect(text('[data-testid="catalog-status"]')[0]).toMatch(/^Checked framejam\.ai for new playbooks on /);
    act(() => root.render(<div />));
    catalog({ checkedAt: "2026-11-02T17:00:00.000Z", lastError: { at: "2026-11-02T18:00:00.000Z", message: "fetch failed" } });
    await list();
    expect(text('[data-testid="catalog-status"]')).toEqual(["Couldn't check framejam.ai for new playbooks: fetch failed"]);
  });

  it("shows no catalog line when the catalog is off or unreachable", async () => {
    catalog({ enabled: false, reason: "env-off", checkedAt: "2026-11-02T17:00:00.000Z" });
    await list();
    expect(text('[data-testid="catalog-status"]')).toEqual([]);
    act(() => root.render(<div />));
    vi.spyOn(api, "catalog").mockRejectedValue(new Error("down"));
    await list();
    expect(text('[data-testid="catalog-status"]')).toEqual([]);
    expect(text('[data-testid="playbook-card"]')).toHaveLength(3);
  });
});

describe("Playbook page", () => {
  it("shows the update notice on the user's copy", async () => {
    await detail("mine");
    expect(text('[data-testid="playbook-update"]')).toEqual(["Your copy is 1.0.0. Version 1.2.0 is available; remove ~/.framejam/playbooks/mine to use it."]);
    expect(text('[data-testid="playbook-updated"]')).toEqual([]);
  });

  it("says a playbook was updated from framejam.ai", async () => {
    await detail("from-catalog");
    expect(text('[data-testid="playbook-updated"]')).toEqual(["Updated from framejam.ai"]);
    expect(text('[data-testid="playbook-update"]')).toEqual([]);
  });

  it("shows neither for a bundled playbook", async () => {
    await detail("bundled-one");
    expect(text('[data-testid="playbook-updated"]')).toEqual([]);
    expect(text('[data-testid="playbook-update"]')).toEqual([]);
    expect(host.textContent).toContain("bundled-one");
  });
});

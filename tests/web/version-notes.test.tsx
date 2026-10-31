// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasHandoff, VersionNotes } from "@/components/review/version-notes";
import type { ReviewVersion } from "@/lib/api";
import type { ReviewDataSource } from "@/lib/data-source";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const version = (over: Partial<ReviewVersion> = {}): ReviewVersion => ({ number: 2, createdAt: "2026-10-02T10:00:00.000Z", ...over }) as ReviewVersion;

async function show(v: ReviewVersion, data: Partial<ReviewDataSource> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<VersionNotes data={data as ReviewDataSource} reviewId="k1" version={v} />));
  return host;
}

describe("hasHandoff", () => {
  it("is true for notes or source, false for neither or blank notes", () => {
    expect(hasHandoff(undefined)).toBe(false);
    expect(hasHandoff(version())).toBe(false);
    expect(hasHandoff(version({ notes: "  \n" }))).toBe(false);
    expect(hasHandoff(version({ notes: "x" }))).toBe(true);
    expect(hasHandoff(version({ source: { filename: "a.zip", bytes: 1, ready: true } }))).toBe(true);
  });
});

describe("the Notes tab", () => {
  it("shows the one-line note and the notes as lists, code and links", async () => {
    const el = await show(
      version({
        note: "Faster cuts",
        notes: "## What changed\n- cut the intro by **2s**\n- answers [the logo comment](https://app.framejam.ai/p/k1?v=1)\n\nRender with:\n```\nnpx hyperframes render\n```\n\n1. unzip\n2. run `npm i`",
      }),
    );
    expect(el.querySelector(".fc-notes-h")?.textContent).toBe("Version 2");
    expect(el.querySelector(".fc-notes-line")?.textContent).toBe("Faster cuts");
    expect(el.querySelector("h4")?.textContent).toBe("What changed");
    expect(el.querySelectorAll("ul li")).toHaveLength(2);
    expect(el.querySelectorAll("ol li")).toHaveLength(2);
    expect(el.querySelector("strong")?.textContent).toBe("2s");
    expect(el.querySelector("pre code")?.textContent).toBe("npx hyperframes render");
    const link = el.querySelector<HTMLAnchorElement>("li a")!;
    expect(link.getAttribute("href")).toBe("https://app.framejam.ai/p/k1?v=1");
    expect(link.rel).toContain("noopener");
  });

  it("never turns notes into HTML or script links", async () => {
    const el = await show(version({ notes: '<img src=x onerror="alert(1)"> [click](javascript:alert(1)) <script>alert(2)</script>' }));
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector('a[href^="javascript"]')).toBeNull();
    expect(el.textContent).toContain("<script>alert(2)</script>");
  });

  it("says when a version only has source files", async () => {
    const el = await show(version({ source: { filename: "teaser-source.zip", bytes: 3 * 1024 * 1024, ready: true } }));
    expect(el.textContent).toContain("No notes on this version.");
    expect(el.querySelector('[data-testid="version-source"]')?.textContent).toContain("teaser-source.zip");
    expect(el.querySelector('[data-testid="version-source"]')?.textContent).toContain("3.0 MB");
  });

  it("downloads the source through a fresh link when asked", async () => {
    const sourceDownload = vi.fn(async () => ({ url: "https://r2.test/sources/x.zip?sig=1", filename: "teaser-source.zip", bytes: 5 }));
    const el = await show(version({ source: { filename: "teaser-source.zip", bytes: 5, ready: true } }), { sourceDownload });
    const clicked: string[] = [];
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    });
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="download-source"]')!.click());
    spy.mockRestore();
    expect(sourceDownload).toHaveBeenCalledWith("k1", 2);
    expect(clicked).toEqual(["https://r2.test/sources/x.zip?sig=1"]);
  });

  it("holds the download back while the source is still uploading", async () => {
    const el = await show(version({ source: { filename: "a.zip", bytes: 5, ready: false } }), { sourceDownload: vi.fn() });
    expect(el.querySelector<HTMLButtonElement>('[data-testid="download-source"]')!.disabled).toBe(true);
    expect(el.textContent).toContain("uploading with the version");
  });

  it("has no download button where the source can't give a link", async () => {
    const el = await show(version({ source: { filename: "a.zip", bytes: 5, ready: true } }));
    expect(el.querySelector('[data-testid="download-source"]')).toBeNull();
  });
});

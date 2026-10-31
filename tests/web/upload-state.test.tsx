// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { UploadState } from "@/components/review/upload-state";
import type { ReviewVersion } from "@/lib/api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function show(upload: ReviewVersion["upload"]) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const version: ReviewVersion = { number: 2, createdAt: new Date().toISOString(), upload };
  act(() => root!.render(<UploadState version={version} />));
  return host.querySelector('[data-testid="upload-state"]');
}

describe("a cloud version's upload state", () => {
  it("shows nothing once the version is in the cloud, and for local projects", () => {
    expect(show(undefined)).toBeNull();
  });

  it("shows the progress while the files upload", () => {
    const el = show({ state: "uploading", bytes: 5 * 1024 * 1024, total: 20 * 1024 * 1024 });
    expect(el?.getAttribute("data-state")).toBe("uploading");
    expect(el?.textContent).toContain("Uploading v2 to FrameJam Cloud");
    expect(el?.textContent).toContain("25%");
    expect(el?.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("25");
  });

  it("says when the upload failed and what to do", () => {
    const el = show({ state: "failed", bytes: 0, total: 100, error: "Network down." });
    expect(el?.getAttribute("data-state")).toBe("failed");
    expect(el?.textContent).toContain("didn't finish uploading");
    expect(el?.textContent).toContain("Network down.");
    expect(el?.textContent).toContain("open it again");
  });
});

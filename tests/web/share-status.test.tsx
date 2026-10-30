// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareStatus } from "@/components/review/share-status";
import type { ShareInfo } from "@/lib/api";
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

async function show(info: ShareInfo | undefined) {
  let changed: () => void = () => {};
  const data = {
    share: info ? vi.fn(async () => info) : undefined,
    setShare: vi.fn(async () => info!),
    subscribe: vi.fn((_id: string, cb: () => void) => {
      changed = cb;
      return () => {};
    }),
  } as unknown as ReviewDataSource;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<ShareStatus data={data} reviewId="rev_1" />));
  await act(async () => {});
  return { data, changed: async () => act(async () => changed()) };
}

const text = () => host!.querySelector('[data-testid="share-status"]')?.textContent ?? null;

describe("the creator's share chip", () => {
  it("shows nothing for a project that isn't shared, or without a local server", async () => {
    await show({ shared: false });
    expect(text()).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    await show(undefined);
    expect(text()).toBeNull();
  });

  it("says Shared, then who approved it", async () => {
    await show({ shared: true, url: "https://www.framejam.ai/v/t", closed: false, allowDownload: true });
    expect(text()).toBe("Shared");
    act(() => root?.unmount());
    host?.remove();
    await show({ shared: true, url: "https://www.framejam.ai/v/t", closed: false, approved: { version: 2, by: "Anna", at: Date.UTC(2026, 9, 30) } });
    expect(text()).toBe("Approved by Anna");
    expect(host!.querySelector(".approved")).not.toBeNull();
  });

  it("says when the link was turned off or expired, even after an approval", async () => {
    await show({ shared: true, closed: true, revokedAt: 5, approved: { version: 2, by: "Anna", at: 1 } });
    expect(text()).toBe("Link turned off");
    act(() => root?.unmount());
    host?.remove();
    await show({ shared: true, closed: true, expiresAt: 5 });
    expect(text()).toBe("Link expired");
  });

  it("shows how many times guests opened the link, and copes with a cloud that doesn't count", async () => {
    await show({ shared: true, closed: false, opens: 3, lastOpenedAt: Date.now() - 3 * 3600_000 });
    expect(text()).toBe("Opened 3 times");
    act(() => root?.unmount());
    host?.remove();
    await show({ shared: true, closed: false, opens: 1 });
    expect(text()).toBe("Opened 1 time");
    act(() => root?.unmount());
    host?.remove();
    await show({ shared: true, closed: false, opens: 0 });
    expect(text()).toBe("Shared");
    act(() => root?.unmount());
    host?.remove();
    await show({ shared: true, closed: false, opens: null });
    expect(text()).toBe("Shared");
    act(() => root?.unmount());
    host?.remove();
    await show({ shared: true, closed: false, approved: { version: 2, by: "Anna", at: 1 }, opens: 5 });
    expect(text()).toBe("Approved by Anna");
  });

  it("reads the link again when the project changes", async () => {
    const s = await show({ shared: true, closed: false });
    await s.changed();
    expect((s.data.share as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});

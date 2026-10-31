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

async function show(info: ShareInfo | undefined, shareSettings = false) {
  let changed: () => void = () => {};
  const data = {
    share: info ? vi.fn(async () => info) : undefined,
    setShare: vi.fn(async () => info!),
    shareSettings,
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

const openMenu = () =>
  act(async () => {
    host!.querySelector<HTMLElement>('[data-testid="share-status"]')!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }));
  });

const pick = (label: string) =>
  act(async () => {
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.startsWith(label))!;
    item.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    item.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    item.click();
  });

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

  it("says Share link, then Approved, with who approved it in the menu", async () => {
    await show({ shared: true, url: "https://www.framejam.ai/v/t", closed: false, allowDownload: true });
    expect(text()).toBe("Share link");
    act(() => root?.unmount());
    host?.remove();
    await show({ shared: true, url: "https://www.framejam.ai/v/t", closed: false, approved: { version: 2, by: "Anna", at: Date.UTC(2026, 9, 30) } });
    expect(text()).toBe("Approved");
    expect(host!.querySelector(".approved")).not.toBeNull();
    await openMenu();
    expect(document.body.textContent).toContain("Anna approved version 2");
  });

  it("says when the link was turned off or expired, even after an approval", async () => {
    await show({ shared: true, closed: true, revokedAt: 5, approved: { version: 2, by: "Anna", at: 1 } });
    expect(text()).toBe("Link turned off");
    act(() => root?.unmount());
    host?.remove();
    await show({ shared: true, closed: true, expiresAt: 5 });
    expect(text()).toBe("Link expired");
  });

  it("shows how many times guests opened the link in its menu, and copes with a cloud that doesn't count", async () => {
    const menuText = async (info: ShareInfo) => {
      act(() => root?.unmount());
      host?.remove();
      await show(info);
      await openMenu();
      return document.body.textContent ?? "";
    };
    expect(await menuText({ shared: true, closed: false, opens: 3, lastOpenedAt: Date.now() - 3 * 3600_000 })).toContain("Opened 3 times, last");
    expect(text()).toBe("Share link");
    expect(await menuText({ shared: true, closed: false, opens: 1 })).toContain("Opened 1 time");
    expect(await menuText({ shared: true, closed: false, opens: 0 })).toContain("Nobody has opened it yet");
    expect(await menuText({ shared: true, closed: false, opens: null })).not.toContain("Opened");
    await menuText({ shared: true, closed: false, approved: { version: 2, by: "Anna", at: 1 }, opens: 5 });
    expect(text()).toBe("Approved");
  });

  it("reopens an approved link for comments after asking", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const s = await show({ shared: true, url: "https://www.framejam.ai/v/t", closed: false, versions: [1, 2], approved: { version: 2, by: "Anna", at: 1 } });
    await openMenu();
    await pick("Reopen for comments");
    expect(confirm).toHaveBeenCalled();
    expect(s.data.setShare).toHaveBeenCalledWith("rev_1", { reopen: true });
    vi.unstubAllGlobals();
  });

  it("has no Reopen before anyone approves", async () => {
    await show({ shared: true, url: "https://www.framejam.ai/v/t", closed: false });
    await openMenu();
    expect(document.body.textContent).not.toContain("Reopen for comments");
  });

  it("lists the expiry as options with the current one checked", async () => {
    const at = Date.UTC(2026, 10, 20);
    const s = await show({ shared: true, url: "https://www.framejam.ai/v/t", closed: false, expiresAt: at }, true);
    await openMenu();
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const date = new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    expect(document.body.textContent).toContain("Link expires");
    expect(items.find((el) => el.textContent?.startsWith(date))?.querySelector(".chk")).not.toBeNull();
    expect(items.find((el) => el.textContent?.startsWith("Never"))?.querySelector(".chk")).toBeNull();
    await pick("Never");
    expect(s.data.setShare).toHaveBeenCalledWith("rev_1", { expiresAt: null });
  });

  it("offers the notes switch only where the link can take it, and flips it", async () => {
    const info = { shared: true, url: "https://www.framejam.ai/v/t", closed: false, allowDownload: true, showNotes: false } as ShareInfo;
    const s = await show(info, true);
    await openMenu();
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes("Show version notes"));
    expect(item).toBeDefined();
    await act(async () => {
      item!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      item!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      item!.click();
    });
    expect(s.data.setShare).toHaveBeenCalledWith("rev_1", { showNotes: true });
  });

  it("has no notes switch for a project that isn't in the cloud", async () => {
    await show({ shared: true, url: "https://www.framejam.ai/v/t", closed: false, allowDownload: true } as ShareInfo);
    await openMenu();
    expect(document.body.textContent).toContain("Allow download");
    expect(document.body.textContent).not.toContain("Show version notes");
  });

  it("reads the link again when the project changes", async () => {
    const s = await show({ shared: true, closed: false });
    await s.changed();
    expect((s.data.share as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});

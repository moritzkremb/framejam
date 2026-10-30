// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudShareSource, type ShareBackend, type ShareView } from "@/lib/cloud-share";
import { SharePage } from "@/pages/share-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINK = "tok_abc";

function videoView(): ShareView {
  return {
    title: "Launch teaser",
    kind: "video",
    versions: [
      { number: 1, at: Date.UTC(2026, 9, 1), video: { url: "https://media.example.com/renders/u/v1.mp4", duration: 8, width: 1920, height: 1080 } },
      { number: 2, at: Date.UTC(2026, 9, 2), note: "Faster cuts", video: { url: "https://media.example.com/renders/u/v2.mp4", duration: 8, width: 1920, height: 1080 } },
    ],
    comments: [
      { id: "k1", version: 2, kind: "pin", time: 1.2, x: 0.5, y: 0.5, text: "Logo is too small", guestName: "Ben", at: Date.UTC(2026, 9, 2, 1), drawing: [[0.1, 0.1, 0.2, 0.2]] },
      { id: "k0", version: 1, kind: "general", time: 0, wholeVideo: true, text: "Old note", guestName: "Ben", at: Date.UTC(2026, 9, 1, 1) },
    ],
    approvals: [],
  };
}

function storyboardView(): ShareView {
  return {
    title: "Coffee ad board",
    kind: "storyboard",
    versions: [{ number: 1, at: Date.UTC(2026, 9, 1), panels: [{ url: "https://media.example.com/p1.png", title: "Pour" }, { url: "https://media.example.com/p2.png", title: "Steam" }] }],
    comments: [],
    approvals: [],
  };
}

/** A fake FrameJam Cloud: `push` delivers a new `guest.view` result like Convex's reactive query would. */
function fakeBackend(initial: ShareView | null) {
  let view = initial;
  const watchers = new Set<(v: ShareView | null) => void>();
  const backend = {
    watch: vi.fn((_link: string, onView: (v: ShareView | null) => void) => {
      watchers.add(onView);
      queueMicrotask(() => onView(view));
      return () => watchers.delete(onView);
    }),
    view: vi.fn(async () => view),
    frameUpload: vi.fn(async () => ({ uploadUrl: "https://r2.example.com/put?sig=1", storageKey: "frames/u/f1.jpg" })),
    send: vi.fn(async (args: Parameters<ShareBackend["send"]>[0]) => ({ ids: args.comments.map((_, i) => `new${i}`) })),
    approve: vi.fn(async () => ({ at: Date.UTC(2026, 9, 3) })),
  } satisfies ShareBackend;
  return {
    backend,
    watchers,
    push(next: ShareView | null) {
      view = next;
      for (const w of watchers) w(view);
    },
  };
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

async function render(fake: ReturnType<typeof fakeBackend>, storage = memoryStorage(), fetchFn: typeof fetch = vi.fn()) {
  const data = cloudShareSource(fake.backend, storage, fetchFn);
  root = createRoot(host);
  act(() => root!.render(<SharePage link={LINK} data={data} />));
  await flush();
  return { data, storage };
}

function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const q = <T extends Element = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`);
const cards = () => [...host.querySelectorAll('[data-testid="comment-card"]')].map((c) => c.textContent ?? "");

/** happy-dom never loads the video; firing `loadedmetadata` hands the page its controller. */
function loadVideo() {
  const video = host.querySelector("video")!;
  Object.defineProperty(video, "duration", { value: 8, configurable: true });
  act(() => {
    video.dispatchEvent(new Event("loadedmetadata"));
  });
  return video;
}

describe("share page", () => {
  it("shows the latest version with everyone's comments, live from the cloud", async () => {
    const fake = fakeBackend(videoView());
    await render(fake);

    expect(host.textContent).toContain("Launch teaser");
    expect(host.textContent).toContain("Version 2 of 2");
    const video = host.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("https://media.example.com/renders/u/v2.mp4");
    expect(video.getAttribute("crossorigin")).toBe("anonymous");
    expect(cards()).toEqual([expect.stringMatching(/Ben.*Logo is too small/)]);
    expect(fake.backend.watch).toHaveBeenCalledWith(LINK, expect.any(Function), expect.any(Function));

    const next = videoView();
    next.comments.push({ id: "k2", version: 2, kind: "range", time: 2, endTime: 4, text: "Too slow", guestName: "Cleo", at: Date.UTC(2026, 9, 2, 2) });
    next.approvals.push({ version: 2, guestName: "Cleo", at: Date.UTC(2026, 9, 2, 3) });
    await act(async () => fake.push(next));
    await flush();
    expect(cards()).toHaveLength(2);
    expect(cards()[1]).toMatch(/Cleo.*Too slow/);
    expect(q("approvals")?.textContent).toContain("Approved by Cleo");
  });

  it("switches versions, each with its own comments", async () => {
    await render(fakeBackend(videoView()));
    act(() => q<HTMLButtonElement>("version-menu")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })));
    await flush();
    const item = [...document.querySelectorAll(".fc-menu-item")].find((el) => el.textContent?.startsWith("Version 1"));
    expect(item).toBeDefined();
    act(() => (item as HTMLElement).click());
    await flush();
    expect(host.querySelector("video")!.getAttribute("src")).toBe("https://media.example.com/renders/u/v1.mp4");
    expect(cards()).toEqual([expect.stringContaining("Old note")]);
  });

  it("pauses and stamps the frame when the guest starts typing", async () => {
    await render(fakeBackend(videoView()));
    const video = loadVideo();
    const pause = vi.spyOn(video, "pause");
    act(() => typeInto(q<HTMLTextAreaElement>("comment-box")!, "Make it pop"));
    expect(pause).toHaveBeenCalled();
    expect(q("anchor")?.textContent).toContain("this frame");
  });

  it("asks for a name and email at the first comment, keeps drafts in the browser, and sends them together", async () => {
    const fake = fakeBackend(videoView());
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    const { storage } = await render(fake, memoryStorage(), put as unknown as typeof fetch);
    loadVideo();

    act(() => typeInto(q<HTMLTextAreaElement>("comment-box")!, "Make it pop"));
    await act(async () => q<HTMLButtonElement>("add-comment")!.click());
    expect(q("guest-form")).not.toBeNull();
    const [name, email] = [...q("guest-form")!.querySelectorAll("input")];
    act(() => typeInto(name!, "Anna"));
    act(() => typeInto(email!, "anna@example.com"));
    await act(async () => q<HTMLFormElement>("guest-form")!.requestSubmit());
    await flush();

    expect(q("guest-form")).toBeNull();
    expect(cards()).toHaveLength(2);
    expect(cards().some((c) => /Anna.*Make it pop/.test(c))).toBe(true);
    expect(JSON.parse(storage.getItem(`framejam:drafts:${LINK}`)!)).toHaveLength(1);
    expect(fake.backend.send).not.toHaveBeenCalled();
    expect(q("send")?.textContent).toContain("Send 1 comment");

    await act(async () => q<HTMLButtonElement>("send")!.click());
    await flush();
    expect(fake.backend.send).toHaveBeenCalledWith({
      link: LINK,
      version: 2,
      name: "Anna",
      email: "anna@example.com",
      comments: [expect.objectContaining({ kind: "general", text: "Make it pop" })],
    });
    expect(JSON.parse(storage.getItem(`framejam:drafts:${LINK}`)!)).toEqual([]);
  });

  it("records an approval for the version on screen", async () => {
    const fake = fakeBackend(videoView());
    const storage = memoryStorage();
    storage.setItem("framejam:guest", JSON.stringify({ name: "Anna", email: "anna@example.com" }));
    await render(fake, storage);

    await act(async () => q<HTMLButtonElement>("approve")!.click());
    await flush();
    expect(fake.backend.approve).toHaveBeenCalledWith({ link: LINK, version: 2, name: "Anna", email: "anna@example.com" });
    expect(q("approve")?.textContent).toContain("Approved");
    expect(q<HTMLButtonElement>("approve")!.disabled).toBe(true);
  });

  it("comments on a storyboard panel", async () => {
    const fake = fakeBackend(storyboardView());
    const storage = memoryStorage();
    storage.setItem("framejam:guest", JSON.stringify({ name: "Anna", email: "anna@example.com" }));
    await render(fake, storage);

    expect([...host.querySelectorAll(".fc-share-panel img")].map((i) => i.getAttribute("src"))).toEqual(["https://media.example.com/p1.png", "https://media.example.com/p2.png"]);
    act(() => (host.querySelectorAll(".fc-share-panel")[1] as HTMLButtonElement).click());
    act(() => typeInto(q<HTMLTextAreaElement>("comment-box")!, "Warmer light"));
    await act(async () => q<HTMLButtonElement>("add-comment")!.click());
    await flush();
    await act(async () => q<HTMLButtonElement>("send")!.click());
    await flush();
    expect(fake.backend.send).toHaveBeenCalledWith(expect.objectContaining({ comments: [expect.objectContaining({ kind: "panel", panel: 2, text: "Warmer light" })] }));
  });

  it("says when the link is closed", async () => {
    await render(fakeBackend(null));
    expect(host.textContent).toContain("This link isn't available");
    expect(host.textContent).toContain("doesn't work anymore");
  });
});

describe("cloud share source", () => {
  it("uploads each draft's frame to storage before sending, and sends without it when the upload fails", async () => {
    const fake = fakeBackend(videoView());
    const storage = memoryStorage();
    storage.setItem("framejam:guest", JSON.stringify({ name: "Anna", email: "anna@example.com" }));
    const put = vi.fn(async (url: string) => {
      if (url === "https://r2.example.com/put?sig=1") return new Response(null, { status: 200 });
      return new Response(null, { status: 500 });
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["jpeg"], { type: "image/jpeg" }))));
    const data = cloudShareSource(fake.backend, storage, put as unknown as typeof fetch);
    await data.addComment(LINK, { version: 2, time: 1, x: 0.2, y: 0.3, text: "Here", thumbnailDataUrl: "data:image/jpeg;base64,AAAA", drawing: [[0.1, 0.1, 0.3, 0.3]] });
    await data.addComment(LINK, { version: 1, time: 0, wholeVideo: true, text: "Overall" });
    fake.backend.frameUpload
      .mockResolvedValueOnce({ uploadUrl: "https://r2.example.com/put?sig=1", storageKey: "frames/u/f1.jpg" })
      .mockRejectedValueOnce(new Error("R2 not configured"));
    await data.addComment(LINK, { version: 2, time: 2, text: "No frame", thumbnailDataUrl: "data:image/jpeg;base64,BBBB" });

    const res = await data.submit(LINK);
    expect(res.batch.commentIds).toHaveLength(3);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith("https://r2.example.com/put?sig=1", expect.objectContaining({ method: "PUT", headers: { "Content-Type": "image/jpeg" } }));
    const calls = fake.backend.send.mock.calls.map(([args]) => args);
    expect(calls.map((c) => c.version)).toEqual([2, 1]);
    expect(calls[0]!.comments).toEqual([
      expect.objectContaining({ kind: "pin", x: 0.2, y: 0.3, drawing: [[0.1, 0.1, 0.3, 0.3]], frame: { key: "frames/u/f1.jpg", bytes: 4 } }),
      expect.objectContaining({ kind: "general", text: "No frame", frame: undefined }),
    ]);
    expect(calls[1]!.comments).toEqual([expect.objectContaining({ kind: "general", wholeVideo: true })]);
    expect((await data.review(LINK)).comments.filter((c) => c.status === "draft")).toEqual([]);
  });

  it("keeps drafts when sending fails, with the cloud's message", async () => {
    const fake = fakeBackend(videoView());
    const storage = memoryStorage();
    storage.setItem("framejam:guest", JSON.stringify({ name: "Anna", email: "anna@example.com" }));
    fake.backend.send.mockRejectedValueOnce(Object.assign(new Error("[CONVEX M(guest:send)] Server Error"), { data: "There's no version 9 on this link" }));
    const data = cloudShareSource(fake.backend, storage, vi.fn());
    await data.addComment(LINK, { version: 2, time: 1, text: "Hi" });
    await expect(data.submit(LINK)).rejects.toThrow("There's no version 9 on this link");
    expect((await data.review(LINK)).comments.filter((c) => c.status === "draft")).toHaveLength(1);
  });

  it("only edits and deletes the guest's own drafts", async () => {
    const data = cloudShareSource(fakeBackend(videoView()).backend, memoryStorage(), vi.fn());
    const c = await data.addComment(LINK, { version: 2, time: 1, text: "Hi" });
    await data.updateComment(LINK, c.id, { text: "Hello" });
    expect((await data.review(LINK)).comments.find((x) => x.id === c.id)?.text).toBe("Hello");
    await expect(data.updateComment(LINK, "k1", { text: "nope" })).rejects.toThrow(/can't be changed/);
    await expect(data.deleteComment(LINK, "k1")).rejects.toThrow(/can't be deleted/);
    await data.deleteComment(LINK, c.id);
    expect((await data.review(LINK)).comments.map((x) => x.id)).toEqual(["k1", "k0"]);
  });
});

// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { cloudShareSource, type ShareBackend, type ShareView, type VoiceResult } from "@/lib/cloud-share";
import { SharePage } from "@/pages/share-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINK = "tok_abc";

const VOICE_TEXT = "This logo is too small. And over here the subtitle needs contrast.";
const VOICE_WORDS = VOICE_TEXT.split(" ").map((text, i) => ({ text, start: 0.5 + i * 0.4, end: 0.8 + i * 0.4 }));

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
    voiceUpload: vi.fn(async () => ({ uploadUrl: "https://r2.example.com/put-voice?sig=1", storageKey: "voice/u/r1.webm", mime: "audio/webm" })),
    voiceTranscribe: vi.fn(async (): Promise<VoiceResult> => ({ voiceId: "vr1", status: "transcribed", text: VOICE_TEXT, words: VOICE_WORDS, duration: 6 })),
    send: vi.fn(async (args: Parameters<ShareBackend["send"]>[0]) => ({ ids: args.comments.map((_, i) => `new${i}`) })),
    approve: vi.fn(async () => ({ at: Date.UTC(2026, 9, 3) })),
    downloadUrl: vi.fn(async () => ({ url: "https://r2.example.com/get?sig=1", filename: "Launch teaser v2.mp4" })),
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

  it("has a Notes tab only when the creator's link sends notes, and never a source download", async () => {
    const fake = fakeBackend(videoView());
    await render(fake);
    expect(q("notes-tab")).toBeNull();

    const next = videoView();
    next.versions[1]!.notes = "## What changed\n- cut the intro\n\nRender: `./render.sh`";
    await act(async () => fake.push(next));
    await flush();
    expect(q("notes-tab")).not.toBeNull();
    expect(q("version-notes")).toBeNull();
    await act(async () => q<HTMLButtonElement>("notes-tab")!.click());
    expect(q("version-notes")?.textContent).toContain("What changed");
    expect(q("version-notes")?.textContent).toContain("Faster cuts");
    expect(q("version-source")).toBeNull();
    expect(q("download-source")).toBeNull();
    expect(cards()).toEqual([]);

    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    await act(async () => tabs[0]!.click());
    expect(q("version-notes")).toBeNull();
    expect(cards()).toHaveLength(1);
  });

  it("shows \"Resolved in vN\" on a comment once the creator's agent ships the fix, live", async () => {
    const fake = fakeBackend(videoView());
    await render(fake);
    expect(host.querySelectorAll('[data-testid="resolved-in"]')).toHaveLength(0);

    const fixed = videoView();
    fixed.versions.push({ number: 3, at: Date.UTC(2026, 9, 3), note: "Bigger logo", video: { url: "https://media.example.com/renders/u/v3.mp4", duration: 8 } });
    fixed.comments[0]!.resolvedIn = 3;
    await act(async () => fake.push(fixed));
    await flush();

    expect(host.textContent).toContain("Version 3 of 3");
    act(() => q<HTMLButtonElement>("version-menu")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })));
    await flush();
    const item = [...document.querySelectorAll(".fc-menu-item")].find((el) => el.textContent?.startsWith("Version 2"));
    act(() => (item as HTMLElement).click());
    await flush();
    expect(q("resolved-in")?.textContent).toContain("Resolved in v3");
    expect(cards()[0]).toMatch(/Logo is too small/);
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

function approvedView(over: Partial<NonNullable<ShareView["approved"]>> = {}): ShareView {
  const v = videoView();
  return {
    ...v,
    versions: [{ ...v.versions[1]!, video: { ...v.versions[1]!.video!, posterUrl: "https://media.example.com/posters/u/v2.jpg" } }],
    comments: [],
    approvals: [{ version: 2, guestName: "Anna", at: Date.UTC(2026, 9, 3) }],
    approved: { version: 2, by: "Anna", at: Date.UTC(2026, 9, 3), download: true, ...over },
  };
}

describe("an approved link", () => {
  it("shows only the approved file, who approved it and when, with one download and no comment box", async () => {
    await render(fakeBackend(approvedView()));
    expect(q("approved-share")).not.toBeNull();
    expect(q("approved-by")!.textContent).toMatch(/Approved by Anna on .*2026/);
    expect(host.querySelector("video")!.getAttribute("src")).toBe("https://media.example.com/renders/u/v2.mp4");
    expect(host.querySelector("video")!.getAttribute("poster")).toBe("https://media.example.com/posters/u/v2.jpg");
    expect(host.querySelectorAll("video")).toHaveLength(1);
    expect(q("download")).not.toBeNull();
    expect(q("comment-box")).toBeNull();
    expect(q("approve")).toBeNull();
    expect(q("version-menu")).toBeNull();
    expect(host.textContent).toContain("comments are closed");
  });

  it("has no download when the creator turned it off", async () => {
    await render(fakeBackend(approvedView({ download: false })));
    expect(q("download")).toBeNull();
    expect(host.textContent).not.toContain("download the original");
    expect(host.querySelector("video")).not.toBeNull();
  });

  it("starts the download through a fresh link from the cloud", async () => {
    const fake = fakeBackend(approvedView());
    const click = vi.fn();
    const make = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string, o?: ElementCreationOptions) => {
      const el = make(tag, o);
      if (tag === "a") el.click = click;
      return el;
    });
    await render(fake);
    await act(async () => q<HTMLButtonElement>("download")!.click());
    expect(fake.backend.downloadUrl).toHaveBeenCalledWith(LINK);
    expect(click).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("flips to the approved state live when a guest approves", async () => {
    const fake = fakeBackend(videoView());
    await render(fake);
    expect(q("approved-share")).toBeNull();
    expect(q("comment-box")).not.toBeNull();
    await act(async () => fake.push(approvedView()));
    await flush();
    expect(q("approved-share")).not.toBeNull();
    expect(q("comment-box")).toBeNull();
  });

  it("reopens when a newer version arrives", async () => {
    const fake = fakeBackend(approvedView());
    await render(fake);
    await act(async () => fake.push(videoView()));
    await flush();
    expect(q("approved-share")).toBeNull();
    expect(q("comment-box")).not.toBeNull();
  });

  it("shows a storyboard's panels without a download", async () => {
    const view: ShareView = { ...storyboardView(), approvals: [{ version: 1, guestName: "Ben", at: Date.UTC(2026, 9, 3) }], approved: { version: 1, by: "Ben", at: Date.UTC(2026, 9, 3), download: false } };
    await render(fakeBackend(view));
    expect(host.querySelectorAll("figure img")).toHaveLength(2);
    expect(q("download")).toBeNull();
    expect(host.querySelector("video")).toBeNull();
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

describe("voice comments", () => {
  const guestStorage = () => {
    const storage = memoryStorage();
    storage.setItem("framejam:guest", JSON.stringify({ name: "Anna", email: "anna@example.com" }));
    return storage;
  };

  /** A MediaRecorder that records nothing but behaves like one: chunks arrive on stop, then `onstop`. */
  function stubRecorder() {
    class FakeRecorder {
      static isTypeSupported = () => true;
      state: "inactive" | "recording" = "inactive";
      mimeType = "audio/webm;codecs=opus";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) }, configurable: true });
    return track;
  }

  const sentVoiceView = (): ShareView => {
    const view = videoView();
    view.comments.push({
      id: "k9",
      version: 2,
      kind: "pin",
      time: 1,
      x: 0.2,
      y: 0.3,
      text: VOICE_TEXT,
      guestName: "Cleo",
      at: Date.UTC(2026, 9, 2, 4),
      voice: {
        status: "transcribed",
        text: VOICE_TEXT,
        duration: 6,
        audioUrl: "https://media.example.com/voice/r1.webm",
        points: [
          { phrase: "This", at: 0.5, time: 1, x: 0.2, y: 0.3, frameUrl: "https://media.example.com/frames/a.jpg" },
          { phrase: "over here", at: 3.7, time: 3.5, frameUrl: "https://media.example.com/frames/b.jpg" },
        ],
      },
    });
    return view;
  };

  it("shows a spoken comment as a transcript whose pointing phrases open the frame that was shown", async () => {
    await render(fakeBackend(sentVoiceView()));
    const links = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="voice-point"]')];
    expect(links.map((l) => l.textContent)).toEqual(["This", "over here"]);
    expect(q("voice-transcript")?.textContent).toBe(VOICE_TEXT);
    expect(q("voice-frame")).toBeNull();
    act(() => links[1]!.click());
    expect(q("voice-frame")?.querySelector("img")?.getAttribute("src")).toBe("https://media.example.com/frames/b.jpg");
    expect(q("voice-frame")?.textContent).toContain("over here");
    expect(q("voice-audio")?.getAttribute("src")).toBe("https://media.example.com/voice/r1.webm");
  });

  it("says when a recording has no transcript instead of showing an empty comment", async () => {
    const view = videoView();
    view.comments.push({ id: "k8", version: 2, kind: "general", time: 0, text: "Voice comment (transcription pending)", guestName: "Cleo", at: Date.UTC(2026, 9, 2, 4), voice: { status: "pending", note: "Transcription pending", audioUrl: "https://media.example.com/voice/r2.webm", points: [] } });
    await render(fakeBackend(view));
    expect(q("voice-note")?.textContent).toBe("Transcription pending");
    expect(q("voice-point")).toBeNull();
    expect(q("voice-audio")).not.toBeNull();
  });

  it("records, uploads and transcribes a voice comment into a draft with one link per pointing phrase", async () => {
    const track = stubRecorder();
    const fake = fakeBackend(videoView());
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:voice" }));
    await render(fake, guestStorage(), put as unknown as typeof fetch);
    loadVideo();

    await act(async () => q("voice-toggle")!.click());
    await flush();
    expect(q("voice-toggle")?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => q("voice-toggle")!.click());
    await flush();

    expect(track.stop).toHaveBeenCalled();
    expect(fake.backend.voiceUpload).toHaveBeenCalledWith(LINK, "audio/webm;codecs=opus");
    expect(put).toHaveBeenCalledWith("https://r2.example.com/put-voice?sig=1", expect.objectContaining({ method: "PUT" }));
    expect(fake.backend.voiceTranscribe).toHaveBeenCalledWith(expect.objectContaining({ link: LINK, storageKey: "voice/u/r1.webm", mime: "audio/webm" }));
    expect([...host.querySelectorAll('[data-testid="voice-point"]')].map((l) => l.textContent)).toEqual(["This", "over here"]);
    expect(q("send")?.textContent).toContain("Send 1 comment");
    expect(q("voice-audio")?.getAttribute("src")).toBe("blob:voice");
  });

  it("sends a voice draft with its recording and one frame per pointing phrase", async () => {
    const fake = fakeBackend(videoView());
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["jpeg"], { type: "image/jpeg" }))));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:voice" }));
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    const data = cloudShareSource(fake.backend, guestStorage(), put as unknown as typeof fetch);
    const result = await data.transcribeVoice(LINK, new Blob(["a"]), "audio/webm", 6);
    await data.addComment(LINK, {
      version: 2,
      time: 1,
      x: 0.2,
      y: 0.3,
      text: result.text ?? "",
      thumbnailDataUrl: "data:image/jpeg;base64,AAAA",
      voice: {
        id: result.voiceId,
        status: result.status,
        duration: 6,
        points: [
          { phrase: "This", at: 0.5, time: 1, x: 0.2, y: 0.3, frame: "data:image/jpeg;base64,AAAA" },
          { phrase: "over here", at: 3.7, time: 3.5, drawing: [[0.1, 0.1, 0.2, 0.2]], frame: "data:image/jpeg;base64,BBBB" },
        ],
      },
    });
    await data.submit(LINK);
    const [args] = fake.backend.send.mock.calls[0]!;
    expect(args.comments).toHaveLength(1);
    expect(args.comments[0]).toEqual(
      expect.objectContaining({
        text: "",
        voice: {
          id: "vr1",
          points: [
            expect.objectContaining({ phrase: "This", time: 1, x: 0.2, frame: { key: "frames/u/f1.jpg", bytes: 4 } }),
            expect.objectContaining({ phrase: "over here", time: 3.5, drawing: [[0.1, 0.1, 0.2, 0.2]], frame: { key: "frames/u/f1.jpg", bytes: 4 } }),
          ],
        },
      }),
    );
  });

  it("keeps a recording that couldn't be transcribed and says so, and doesn't allow editing it", async () => {
    const fake = fakeBackend(videoView());
    fake.backend.voiceTranscribe.mockResolvedValueOnce({ voiceId: "vr2", status: "pending", words: [], duration: 3, note: "Transcription pending" });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:voice" }));
    const data = cloudShareSource(fake.backend, guestStorage(), vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch);
    const result = await data.transcribeVoice(LINK, new Blob(["a"]), "audio/webm", 3);
    const c = await data.addComment(LINK, { version: 2, time: 0, text: result.note ?? "", voice: { id: result.voiceId, status: result.status, note: result.note, points: [] } });
    expect(c.voice).toEqual(expect.objectContaining({ status: "pending", note: "Transcription pending", audioUrl: "blob:voice" }));
    await expect(data.updateComment(LINK, c.id, { text: "x" })).rejects.toThrow(/can't be edited/);
  });

  async function recordOnce() {
    await act(async () => q("voice-toggle")!.click());
    await flush();
    await act(async () => q("voice-toggle")!.click());
    await flush();
  }

  it("keeps a voice comment whose upload is blocked (CORS) as a draft that says so, and Retry saves it", async () => {
    stubRecorder();
    const fake = fakeBackend(videoView());
    const put = vi.fn(async (): Promise<Response> => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:voice" }));
    const { storage } = await render(fake, guestStorage(), put as unknown as typeof fetch);
    loadVideo();
    await recordOnce();

    expect(q("voice-unsaved")?.textContent).toContain("Voice not saved.");
    expect(q("voice-unsaved")?.textContent).toContain("CORS");
    expect(q("voice-retry")).not.toBeNull();
    expect(q("voice-as-text")).not.toBeNull();
    expect(JSON.parse(storage.getItem(`framejam:drafts:${LINK}`)!)).toEqual([expect.objectContaining({ text: "", unsavedVoice: expect.objectContaining({ error: expect.stringContaining("CORS") }) })]);
    expect(q<HTMLButtonElement>("send")?.disabled).toBe(true);
    expect(fake.backend.voiceTranscribe).not.toHaveBeenCalled();

    const failedId = JSON.parse(storage.getItem(`framejam:drafts:${LINK}`)!)[0].id;
    const dismiss = vi.spyOn(toast, "dismiss");
    put.mockImplementation(async () => new Response(null, { status: 200 }));
    await act(async () => q("voice-retry")!.click());
    await flush();
    expect(q("voice-unsaved")).toBeNull();
    expect(dismiss).toHaveBeenCalledWith(`voice-${failedId}`);
    expect([...host.querySelectorAll('[data-testid="voice-point"]')].map((l) => l.textContent)).toEqual(["This", "over here"]);
    expect(q("send")?.textContent).toContain("Send 1 comment");
    expect(JSON.parse(storage.getItem(`framejam:drafts:${LINK}`)!)).toHaveLength(1);
  });

  it("sends a voice comment whose upload link expired as text instead", async () => {
    stubRecorder();
    const fake = fakeBackend(videoView());
    const put = vi.fn(async () => new Response(null, { status: 403 }));
    await render(fake, guestStorage(), put as unknown as typeof fetch);
    loadVideo();
    await recordOnce();

    expect(q("voice-unsaved")?.textContent).toMatch(/refused it \(403, the upload link may have expired\)/);
    await act(async () => q("voice-as-text")!.click());
    const box = host.querySelector<HTMLTextAreaElement>('[data-testid="comment-card"] textarea')!;
    act(() => typeInto(box, "The logo is too small"));
    const saveButton = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="comment-card"] button')].find((b) => b.textContent === "Save")!;
    await act(async () => saveButton.click());
    await flush();

    expect(q("voice-unsaved")).toBeNull();
    expect(cards().some((t) => t.includes("The logo is too small"))).toBe(true);
    await act(async () => q("send")!.click());
    await flush();
    const [args] = fake.backend.send.mock.calls[0]!;
    expect(args.comments).toEqual([expect.objectContaining({ text: "The logo is too small", voice: undefined })]);
  });

  it("keeps a storyboard voice comment on its panel when the upload fails", async () => {
    stubRecorder();
    const fake = fakeBackend(storyboardView());
    const put = vi.fn(async (): Promise<Response> => {
      throw new TypeError("Failed to fetch");
    });
    const { storage } = await render(fake, guestStorage(), put as unknown as typeof fetch);
    act(() => host.querySelectorAll<HTMLButtonElement>(".fc-share-panel")[1]!.click());
    await recordOnce();

    expect(q("voice-unsaved")?.textContent).toContain("Voice not saved.");
    expect(q("voice-retry")).not.toBeNull();
    expect(JSON.parse(storage.getItem(`framejam:drafts:${LINK}`)!)).toEqual([expect.objectContaining({ panel: 2, kind: "panel", unsavedVoice: expect.any(Object) })]);
  });

  it("doesn't send an unsaved voice draft, and after a reload offers only typing it", async () => {
    const fake = fakeBackend(videoView());
    const storage = guestStorage();
    const data = cloudShareSource(fake.backend, storage, vi.fn() as unknown as typeof fetch);
    await data.addComment(LINK, { version: 2, time: 1, text: "", unsavedVoice: { error: "The recording couldn't be uploaded.", duration: 4 } });
    await expect(data.submit(LINK)).rejects.toThrow(/wasn't saved/);
    await data.addComment(LINK, { version: 2, time: 2, text: "Typed one" });
    await data.submit(LINK);
    expect(fake.backend.send.mock.calls[0]![0].comments).toEqual([expect.objectContaining({ text: "Typed one" })]);
    expect(JSON.parse(storage.getItem(`framejam:drafts:${LINK}`)!)).toEqual([expect.objectContaining({ unsavedVoice: expect.any(Object) })]);

    await render(fake, storage);
    expect(q("voice-unsaved")?.textContent).toContain("lost when the page reloaded");
    expect(q("voice-retry")).toBeNull();
    expect(q("voice-as-text")).not.toBeNull();
  });
});

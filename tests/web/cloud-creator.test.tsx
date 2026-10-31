// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComparePage } from "@/components/review/compare";
import { creatorSource, type CloudLink, type CreatorBackend, type WireReview } from "@/lib/cloud-creator";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const wire = (over: Partial<WireReview> = {}): WireReview => ({
  id: "k1",
  title: "Launch teaser",
  kind: "video",
  projectKey: "launch",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z",
  listeningAt: null,
  versions: [
    { number: 1, createdAt: "2026-10-01T10:00:00.000Z", upload: { state: "ready", bytes: 5, total: 5 }, hasVideo: true, videoUrl: "https://media.example.com/v1.mp4", posterUrl: "https://media.example.com/v1.jpg" },
    { number: 2, createdAt: "2026-10-02T10:00:00.000Z", note: "Faster cuts", upload: { state: "uploading", bytes: 2, total: 5 }, hasVideo: false },
  ],
  comments: [
    { id: "c1", version: 1, kind: "pin", time: 1.5, x: 0.2, y: 0.3, text: "Logo", status: "draft", createdAt: "2026-10-01T11:00:00.000Z", frameUrl: "https://media.example.com/f.jpg" },
    { id: "c2", version: 1, kind: "general", time: 0, wholeVideo: true, text: "Nice", status: "sent", createdAt: "2026-10-01T12:00:00.000Z", author: "Ben" },
  ],
  batches: [],
  ...over,
});

const link = (over: Partial<CloudLink> = {}): CloudLink => ({
  token: "tok",
  createdAt: 1,
  sharedVersion: 1,
  expiresAt: null,
  revokedAt: null,
  approved: null,
  allowDownload: false,
  opens: 3,
  lastOpenedAt: null,
  approvals: [],
  guestCommentsWaiting: 0,
  ...over,
});

function fakeBackend(initial: WireReview | null = wire(), initialLink: CloudLink | null = null) {
  let view = initial;
  let current = initialLink;
  const reviewWatchers = new Set<(v: WireReview | null) => void>();
  const linkWatchers = new Set<(l: CloudLink | null) => void>();
  const backend = {
    watch: vi.fn((_id: string, on: (v: WireReview | null) => void) => {
      reviewWatchers.add(on);
      return () => reviewWatchers.delete(on);
    }),
    get: vi.fn(async () => view),
    addComment: vi.fn(async (_id: string, c: { text: string; time: number; kind?: string }) => ({
      id: "new1",
      version: 1,
      kind: (c.kind ?? "pin") as "pin",
      time: c.time,
      text: c.text,
      status: "draft" as const,
      createdAt: "2026-10-03T00:00:00.000Z",
    })),
    updateComment: vi.fn(async () => {}),
    deleteComment: vi.fn(async () => {}),
    submit: vi.fn(async () => ({ batch: { id: "b1", createdAt: "x", commentIds: ["c1"] } })),
    reopen: vi.fn(async () => ({ wasDelivered: false })),
    transcript: vi.fn(async () => null),
    frameTicket: vi.fn(async () => ({ uploadUrl: "https://r2.example.com/put", storageKey: "frames/u/f.jpg" })),
    registerFrame: vi.fn(async () => ({ assetId: "a1" })),
    setCommentFrame: vi.fn(async () => {}),
    link: vi.fn(async () => current),
    watchLink: vi.fn((_id: string, on: (l: CloudLink | null) => void) => {
      linkWatchers.add(on);
      return () => linkWatchers.delete(on);
    }),
    share: vi.fn(async () => {
      current = link();
      return current;
    }),
    configure: vi.fn(async (_id: string, change: { revoked?: boolean }) => {
      if (current) current = { ...current, revokedAt: change.revoked ? 5 : null };
    }),
  } satisfies CreatorBackend;
  return {
    backend,
    pushReview(next: WireReview | null) {
      view = next;
      for (const w of reviewWatchers) w(next);
    },
    pushLink(next: CloudLink | null) {
      current = next;
      for (const w of linkWatchers) w(next);
    },
  };
}

describe("the creator's data source", () => {
  it("maps a cloud project to the review the page already knows", async () => {
    const { backend } = fakeBackend();
    const source = creatorSource(backend);
    const review = await source.review("k1");
    expect(review.cloud).toBe(true);
    expect(review.versions[0]?.videoPath).toBe("https://media.example.com/v1.mp4");
    expect(review.versions[0]?.upload).toBeUndefined();
    expect(review.versions[1]?.videoPath).toBeUndefined();
    expect(review.versions[1]?.upload).toMatchObject({ state: "uploading", bytes: 2, total: 5 });
    expect(review.comments.find((c) => c.id === "c1")?.thumbnail).toBe("https://media.example.com/f.jpg");
    expect(review.comments.find((c) => c.id === "c2")?.author).toBe("Ben");
    expect(source.videoUrl("k1", 1)).toBe("https://media.example.com/v1.mp4");
    expect(source.poster("k1", 1)).toBe("https://media.example.com/v1.jpg");
    expect(source.compare).toBe(true);
  });

  it("says the agent is listening for a short while after its last heartbeat", async () => {
    let now = 100_000;
    const { backend } = fakeBackend(wire({ listeningAt: 95_000 }));
    const source = creatorSource(backend, { now: () => now });
    expect((await source.review("k1")).agentListening).toBe(true);
    now = 105_000;
    expect((await source.review("k1")).agentListening).toBe(true);
    now = 120_000;
    expect((await source.review("k1")).agentListening).toBe(false);
  });

  it("tells the page when the project or its link changes", async () => {
    const fake = fakeBackend();
    const source = creatorSource(fake.backend);
    const onChange = vi.fn();
    const stop = source.subscribe("k1", onChange);
    fake.pushReview(wire({ comments: [] }));
    expect((await source.review("k1")).comments).toHaveLength(0);
    fake.pushLink(link({ guestCommentsWaiting: 1 }));
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
    expect(fake.backend.watch).toHaveBeenCalledTimes(1);
  });

  it("saves a comment, then uploads its frame without blocking it", async () => {
    const { backend } = fakeBackend();
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    const source = creatorSource(backend, { fetchFn: put as unknown as typeof fetch });
    await source.review("k1");
    const frame = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    await source.addComment("k1", { time: 2, kind: "pin", text: "Move this", x: 0.5, y: 0.5, thumbnailDataUrl: frame });
    expect(backend.addComment).toHaveBeenCalledWith("k1", expect.objectContaining({ text: "Move this", time: 2 }));
    expect(put).toHaveBeenCalledTimes(1);
    expect(backend.registerFrame).toHaveBeenCalledWith(expect.objectContaining({ storageKey: "frames/u/f.jpg" }));
    expect(backend.setCommentFrame).toHaveBeenCalledWith("k1", "new1", "a1");
  });

  it("keeps the comment when the frame upload fails", async () => {
    const { backend } = fakeBackend();
    const put = vi.fn(async () => new Response(null, { status: 403 }));
    const source = creatorSource(backend, { fetchFn: put as unknown as typeof fetch });
    const out = await source.addComment("k1", { time: 2, kind: "pin", text: "Move this", thumbnailDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" });
    expect(out.id).toBe("new1");
    expect(backend.registerFrame).not.toHaveBeenCalled();
  });

  it("sends, edits, deletes and reopens through the backend", async () => {
    const { backend } = fakeBackend();
    const source = creatorSource(backend);
    expect((await source.submit("k1")).batch.id).toBe("b1");
    await source.updateComment("k1", "c1", { text: "New text" });
    await source.deleteComment("k1", "c1");
    expect((await source.reopen("k1")).wasDelivered).toBe(false);
    expect(backend.updateComment).toHaveBeenCalledWith("k1", "c1", "New text");
    expect(backend.deleteComment).toHaveBeenCalledWith("k1", "c1");
  });

  it("describes the share link and can make or change it", async () => {
    const { backend } = fakeBackend();
    const source = creatorSource(backend, { shareOrigin: "https://www.framejam.ai" });
    expect(await source.share!("k1")).toEqual({ shared: false });
    const made = await source.publishShare("k1");
    expect(made).toMatchObject({ shared: true, url: "https://www.framejam.ai/v/tok", closed: false });
    const closed = await source.setShare!("k1", { revoked: true });
    expect(closed.closed).toBe(true);
    expect(backend.configure).toHaveBeenCalledWith("k1", { revoked: true });
  });

  it("writes the review page address into the prompt for the agent", async () => {
    const { backend } = fakeBackend();
    const source = creatorSource(backend);
    const text = await source.prompt("k1");
    expect(text).toContain(`Review: ${window.location.origin}/p/k1`);
    expect(text).toContain("Logo");
  });
});

describe("comparing two versions", () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  async function show(onClose = () => {}) {
    const two = wire({
      versions: [
        { number: 1, createdAt: "2026-10-01T10:00:00.000Z", upload: { state: "ready", bytes: 5, total: 5 }, hasVideo: true, videoUrl: "https://media.example.com/v1.mp4" },
        { number: 2, createdAt: "2026-10-02T10:00:00.000Z", upload: { state: "ready", bytes: 5, total: 5 }, hasVideo: true, videoUrl: "https://media.example.com/v2.mp4" },
        { number: 3, createdAt: "2026-10-03T10:00:00.000Z", upload: { state: "ready", bytes: 5, total: 5 }, hasVideo: true, videoUrl: "https://media.example.com/v3.mp4" },
      ],
    });
    const { backend } = fakeBackend(two);
    const source = creatorSource(backend);
    const review = await source.review("k1");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<ComparePage review={review} data={source} initial={[1, 3]} onClose={onClose} />));
    return host;
  }

  it("shows the two chosen versions side by side, synced to begin with", async () => {
    const el = await show();
    const a = el.querySelector<HTMLVideoElement>('[data-testid="compare-video-a"]')!;
    const b = el.querySelector<HTMLVideoElement>('[data-testid="compare-video-b"]')!;
    expect(a.getAttribute("src")).toBe("https://media.example.com/v1.mp4");
    expect(b.getAttribute("src")).toBe("https://media.example.com/v3.mp4");
    expect(el.querySelector('[data-testid="compare-play"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="compare-sync"]')?.textContent).toContain("Synced");
  });

  it("switches to free playback with each video's own controls", async () => {
    const el = await show();
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="compare-sync"]')!.click());
    expect(el.querySelector('[data-testid="compare-play"]')).toBeNull();
    expect(el.querySelector('[data-testid="compare-video-a"]')?.hasAttribute("controls")).toBe(true);
    expect(el.querySelector('[data-testid="compare-sync"]')?.textContent).toContain("Free");
  });

  it("goes back when asked", async () => {
    const onClose = vi.fn();
    const el = await show(onClose);
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="compare-close"]')!.click());
    expect(onClose).toHaveBeenCalled();
  });
});

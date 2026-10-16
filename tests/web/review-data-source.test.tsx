// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Review, ReviewComment } from "@/lib/api";
import { localDataSource, type NewComment, type ReviewDataSource } from "@/lib/data-source";
import { ReviewPage } from "@/pages/review-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const at = "2026-01-01T00:00:00.000Z";

function comment(over: Partial<ReviewComment>): ReviewComment {
  return { id: "c1", version: 1, kind: "general", time: 0, text: "", status: "draft", createdAt: at, ...over };
}

function videoReview(): Review {
  return {
    id: "rev_video",
    title: "Launch teaser",
    projectKey: "k",
    createdAt: at,
    updatedAt: at,
    versions: [{ number: 1, videoPath: "/renders/teaser.mp4", createdAt: at }],
    comments: [comment({ id: "c1", kind: "pin", time: 1.2, x: 0.5, y: 0.5, text: "Logo is too small" })],
    batches: [],
  };
}

function storyboardReview(): Review {
  const panel = (n: number, title: string) => ({ image: `panels/${n}.png`, sourcePath: `/boards/${n}.png`, title });
  return {
    id: "rev_board",
    title: "Coffee ad board",
    projectKey: "k",
    createdAt: at,
    updatedAt: at,
    versions: [{ number: 1, panels: [panel(1, "Pour"), panel(2, "Steam")], createdAt: at }],
    comments: [comment({ id: "c1", kind: "panel", panel: 2, text: "Warmer light here" })],
    batches: [],
  };
}

/** An in-memory data source: nothing reaches the network. */
function fakeSource(initial: Review) {
  let review = structuredClone(initial);
  const listeners = new Set<() => void>();
  const added: NewComment[] = [];
  const source: ReviewDataSource = {
    review: async () => structuredClone(review),
    subscribe(_id, onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    async addComment(_id, body) {
      added.push(body);
      const c = comment({ ...body, id: `c${review.comments.length + 1}`, version: body.version ?? 1 });
      review.comments.push(c);
      return c;
    },
    updateComment: async () => ({}),
    deleteComment: async () => ({}),
    submit: async () => ({ batch: { id: "b1", commentIds: [] }, agentListening: true }),
    reopen: async () => ({ wasDelivered: false, review }),
    prompt: async () => "",
    downloadVideo: async () => ({ cancelled: true }),
    videoUrl: (id, v) => `fake://${id}/v${v}.mp4`,
    panelUrl: (id, v, n) => `fake://${id}/v${v}/panel-${n}.png`,
  };
  return {
    source,
    added,
    listeners,
    /** Changes the review "elsewhere" and tells subscribers, like a new comment from another tab. */
    change(fn: (r: Review) => void) {
      fn(review);
      for (const l of listeners) l();
    },
  };
}

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("the review page went to the network"))));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => {});
}

async function renderReview(id: string, data: ReviewDataSource) {
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[`/review/${id}`]}>
        <Routes>
          <Route path="/review/:id" element={<ReviewPage data={data} />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
}

function typeInto(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("review screens with a data source", () => {
  it("render a video project from a fake data source", async () => {
    const fake = fakeSource(videoReview());
    await renderReview("rev_video", fake.source);

    expect(host.textContent).toContain("Launch teaser");
    expect(host.querySelector("video")?.getAttribute("src")).toBe("fake://rev_video/v1.mp4");
    expect([...host.querySelectorAll('[data-testid="comment-card"]')].map((c) => c.textContent)).toEqual([
      expect.stringContaining("Logo is too small"),
    ]);
    expect(host.querySelector('[data-testid="send-to-agent"]')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("render a storyboard's panels from the data source's URLs", async () => {
    const fake = fakeSource(storyboardReview());
    await renderReview("rev_board", fake.source);

    const panels = [...host.querySelectorAll('[data-testid="storyboard-panel"] img')].map((img) => img.getAttribute("src"));
    expect(panels).toEqual(["fake://rev_board/v1/panel-1.png", "fake://rev_board/v1/panel-2.png"]);
    expect(host.textContent).toContain("Warmer light here");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reload when the data source reports a change, and unsubscribe on unmount", async () => {
    const fake = fakeSource(videoReview());
    await renderReview("rev_video", fake.source);
    expect(fake.listeners.size).toBe(1);

    await act(async () => fake.change((r) => r.comments.push(comment({ id: "c2", time: 2, text: "Cut the intro" }))));
    await flush();
    expect(host.querySelectorAll('[data-testid="comment-card"]')).toHaveLength(2);

    act(() => root!.unmount());
    root = null;
    expect(fake.listeners.size).toBe(0);
  });

  it("add comments through the data source", async () => {
    const fake = fakeSource(storyboardReview());
    await renderReview("rev_board", fake.source);

    const box = host.querySelector<HTMLTextAreaElement>(".entry textarea")!;
    act(() => typeInto(box, "Tighter crop on the cup"));
    const add = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Add comment"))!;
    await act(async () => add.click());
    await flush();

    expect(fake.added).toEqual([expect.objectContaining({ version: 1, wholeVideo: true, text: "Tighter crop on the cup" })]);
    expect(host.textContent).toContain("Tighter crop on the cup");
  });
});

describe("local data source", () => {
  it("talks to the same local endpoints as before", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
        return new Response("{}", { headers: { "content-type": "application/json" } });
      }),
    );
    const sources: { url: string; closed: boolean; events: string[] }[] = [];
    vi.stubGlobal(
      "EventSource",
      class {
        entry = { url: "", closed: false, events: [] as string[] };
        constructor(url: string) {
          this.entry.url = url;
          sources.push(this.entry);
        }
        addEventListener(type: string) {
          this.entry.events.push(type);
        }
        close() {
          this.entry.closed = true;
        }
      },
    );

    await localDataSource.review("r1");
    await localDataSource.addComment("r1", { text: "hi", time: 1 });
    await localDataSource.updateComment("r1", "c1", { text: "edit" });
    await localDataSource.deleteComment("r1", "c1");
    await localDataSource.submit("r1");
    await localDataSource.reopen("r1");
    await localDataSource.prompt("r1", 2);
    await localDataSource.downloadVideo("r1", 2);
    const unsubscribe = localDataSource.subscribe("r1", () => {});

    expect(calls).toEqual([
      { url: "/api/reviews/r1", method: "GET", body: undefined },
      { url: "/api/reviews/r1/comments", method: "POST", body: JSON.stringify({ text: "hi", time: 1 }) },
      { url: "/api/reviews/r1/comments/c1", method: "PATCH", body: JSON.stringify({ text: "edit" }) },
      { url: "/api/reviews/r1/comments/c1", method: "DELETE", body: undefined },
      { url: "/api/reviews/r1/submit", method: "POST", body: "{}" },
      { url: "/api/reviews/r1/reopen", method: "POST", body: undefined },
      { url: "/api/reviews/r1/prompt?version=2", method: "GET", body: undefined },
      { url: "/api/reviews/r1/versions/2/download", method: "POST", body: undefined },
    ]);
    expect(sources).toEqual([{ url: "/api/reviews/r1/events", closed: false, events: ["changed"] }]);
    unsubscribe();
    expect(sources[0].closed).toBe(true);
    expect(localDataSource.videoUrl("r1", 2)).toBe("/api/reviews/r1/versions/2/video");
    expect(localDataSource.panelUrl("r1", 2, 3)).toBe("/api/reviews/r1/versions/2/panels/3");
  });
});

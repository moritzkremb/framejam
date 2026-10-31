// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectLivePreview, elementLabel } from "@/lib/live-preview";

function fakeFrame() {
  const sent: Record<string, unknown>[] = [];
  const win = { postMessage: (m: Record<string, unknown>) => sent.push(m) };
  const iframe = { contentWindow: win } as unknown as HTMLIFrameElement;
  const say = (data: Record<string, unknown>, source: unknown = win) => window.dispatchEvent(Object.assign(new Event("message"), { data: { framejam: "preview", ...data }, source }));
  return { iframe, sent, say };
}

describe("the live preview controller", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for the frame, then drives it and resolves elements", async () => {
    const { iframe, sent, say } = fakeFrame();
    const connecting = connectLivePreview(iframe);
    say({ type: "ready", mode: "hyperframes", width: 1080, height: 1920, duration: 6 }, {});
    say({ type: "ready", mode: "hyperframes", width: 1080, height: 1920, duration: 6 });
    const live = await connecting;
    expect(live).toMatchObject({ mode: "hyperframes", width: 1080, height: 1920, duration: 6 });

    live.seek(9);
    expect(live.getTime()).toBe(6);
    expect(sent.at(-1)).toEqual({ framejam: "preview-cmd", cmd: "seek", time: 6 });
    say({ type: "state", time: 2.5, playing: false });
    expect(live.getTime()).toBe(2.5);
    live.play();
    expect(live.isPlaying()).toBe(true);
    live.setRate(2);
    expect(sent.at(-1)).toEqual({ framejam: "preview-cmd", cmd: "rate", rate: 2 });

    const resolving = live.resolveAt(0.5, 0.25, 2.5);
    const ask = sent.at(-1)!;
    expect(ask).toMatchObject({ cmd: "resolve", x: 0.5, y: 0.25, time: 2.5 });
    say({ type: "resolved", id: ask.id, element: { selector: "#title", tagName: "h1", text: "Hello", tweens: [] } });
    expect(await resolving).toMatchObject({ selector: "#title" });
    live.dispose();
  });

  it("rejects with the frame's message when the composition can't play", async () => {
    const { iframe, say } = fakeFrame();
    const connecting = connectLivePreview(iframe);
    say({ type: "error", message: "No timeline registered" });
    await expect(connecting).rejects.toThrow("No timeline registered");
  });

  it("gives up when the frame never answers", async () => {
    vi.useFakeTimers();
    const { iframe } = fakeFrame();
    const connecting = connectLivePreview(iframe, { timeoutMs: 1000 });
    vi.advanceTimersByTime(1001);
    await expect(connecting).rejects.toThrow("didn't start");
  });

  it("names an element by its text, or its tag", () => {
    expect(elementLabel({ selector: "#t", tagName: "h1", text: "Hello", tweens: [] })).toBe('"Hello"');
    expect(elementLabel({ selector: "#t", tagName: "img", tweens: [] })).toBe("<img>");
  });
});

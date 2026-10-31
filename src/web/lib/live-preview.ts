import type { ElementInfo } from "@/lib/api";

/**
 * The page's side of the live preview (H4.3). The composition runs in a sandboxed iframe on another origin, so the
 * page can't touch its DOM the way the local player did. A small script FrameJam Cloud adds to the composition answers
 * over `postMessage`: it reports the playhead, takes play, pause, seek and rate, and resolves the element under a
 * point. Messages from the frame have origin "null", so they are trusted only when they come from this iframe.
 */
export interface LivePreview {
  mode: "hyperframes" | "gsap";
  duration: number;
  width: number;
  height: number;
  play(): void;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  isPlaying(): boolean;
  setRate(rate: number): void;
  /** The element under a normalized point at `time`, with its clip and GSAP tweens. */
  resolveAt(x: number, y: number, time: number): Promise<ElementInfo | undefined>;
  dispose(): void;
}

interface FrameMessage {
  framejam: "preview";
  type: "ready" | "state" | "resolved" | "error";
  mode?: "hyperframes" | "gsap";
  width?: number;
  height?: number;
  duration?: number;
  time?: number;
  playing?: boolean;
  id?: string;
  element?: ElementInfo;
  message?: string;
}

const READY_TIMEOUT_MS = 15_000;
const RESOLVE_TIMEOUT_MS = 800;

/** Waits for the composition in `iframe` to say it's ready; rejects with the frame's own message when it can't play. */
export function connectLivePreview(iframe: HTMLIFrameElement, opts: { timeoutMs?: number } = {}): Promise<LivePreview> {
  return new Promise((resolve, reject) => {
    let state = { time: 0, playing: false, at: performance.now() };
    let rate = 1;
    let ready: LivePreview | null = null;
    let seq = 0;
    const pending = new Map<string, (el: ElementInfo | undefined) => void>();

    const send = (msg: Record<string, unknown>) => iframe.contentWindow?.postMessage({ framejam: "preview-cmd", ...msg }, "*");

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const m = e.data as FrameMessage | null;
      if (!m || m.framejam !== "preview") return;
      if (m.type === "state") {
        state = { time: Number(m.time) || 0, playing: Boolean(m.playing), at: performance.now() };
      } else if (m.type === "resolved" && m.id) {
        pending.get(m.id)?.(m.element);
        pending.delete(m.id);
      } else if (m.type === "error" && !ready) {
        cleanup();
        reject(new Error(m.message || "The composition couldn't play."));
      } else if (m.type === "ready" && !ready) {
        clearTimeout(timer);
        const duration = Number(m.duration) || 0;
        ready = {
          mode: m.mode === "gsap" ? "gsap" : "hyperframes",
          duration,
          width: Number(m.width) || 1920,
          height: Number(m.height) || 1080,
          play: () => {
            state = { ...state, playing: true, at: performance.now() };
            send({ cmd: "play" });
          },
          pause: () => {
            state = { time: ready!.getTime(), playing: false, at: performance.now() };
            send({ cmd: "pause" });
          },
          seek: (t) => {
            const time = Math.max(0, Math.min(duration || t, t));
            state = { ...state, time, at: performance.now() };
            send({ cmd: "seek", time });
          },
          // Between reports the playhead moves on at the playback rate, so the timeline stays smooth.
          getTime: () => {
            if (!state.playing) return state.time;
            const t = state.time + ((performance.now() - state.at) / 1000) * rate;
            return Math.min(duration || t, t);
          },
          isPlaying: () => state.playing,
          setRate: (r) => {
            rate = r;
            send({ cmd: "rate", rate: r });
          },
          resolveAt: (x, y, time) =>
            new Promise((done) => {
              const id = `r${++seq}`;
              const timeout = setTimeout(() => {
                pending.delete(id);
                done(undefined);
              }, RESOLVE_TIMEOUT_MS);
              pending.set(id, (el) => {
                clearTimeout(timeout);
                done(el);
              });
              send({ cmd: "resolve", x, y, time, id });
            }),
          dispose: cleanup,
        };
        resolve(ready);
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("The composition didn't start in time."));
    }, opts.timeoutMs ?? READY_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      for (const done of pending.values()) done(undefined);
      pending.clear();
    }

    window.addEventListener("message", onMessage);
  });
}

/** A short name for an element in the comment box and the comment list: its text, or its tag. */
export function elementLabel(el: ElementInfo): string {
  const text = el.text?.trim();
  if (text) return `"${text.length > 32 ? `${text.slice(0, 31)}…` : text}"`;
  return `<${el.tagName}>`;
}

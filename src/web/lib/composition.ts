import type { ElementInfo, TweenInfo } from "../../shared/types";

/** Minimal GSAP surface we touch inside the composition iframe. */
interface GsapAnimation {
  startTime(): number;
  duration(): number;
  totalDuration(): number;
  parent: GsapTimeline | null;
  vars: Record<string, unknown>;
  targets?: () => unknown[];
}
interface GsapTimeline extends GsapAnimation {
  getChildren(nested: boolean, tweens: boolean, timelines: boolean): GsapAnimation[];
  time(t?: number): number;
  seek(t: number, suppressEvents?: boolean): GsapTimeline;
  pause(): GsapTimeline;
}

interface HyperframesPlayer {
  play(): void;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
}

type CompositionWindow = Window & {
  __player?: HyperframesPlayer;
  __playerReady?: boolean;
  __timelines?: Record<string, GsapTimeline>;
};

export interface LiveController {
  mode: "hyperframes" | "gsap";
  width: number;
  height: number;
  duration: number;
  play(): void;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  isPlaying(): boolean;
  resolveAt(x: number, y: number, time: number): ElementInfo | undefined;
}

export function compositionSize(doc: Document): { width: number; height: number } {
  const node = doc.querySelector("[data-composition-id][data-width]") ?? doc.querySelector("[data-width]");
  const w = Number(node?.getAttribute("data-width"));
  const h = Number(node?.getAttribute("data-height"));
  if (w && h) return { width: w, height: h };
  const vp = doc.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
  const vw = Number(/width=(\d+)/.exec(vp)?.[1]);
  const vh = Number(/height=(\d+)/.exec(vp)?.[1]);
  if (vw && vh) return { width: vw, height: vh };
  return { width: 1920, height: 1080 };
}

function rootTimeline(win: CompositionWindow): GsapTimeline | undefined {
  const timelines = win.__timelines ?? {};
  const id = win.document.querySelector("[data-composition-id]")?.getAttribute("data-composition-id") ?? "";
  return timelines[id] ?? Object.values(timelines)[0];
}

/**
 * Connects to a composition loaded in a same-origin iframe. Prefers the Hyperframes
 * runtime (`window.__player`, injected by the server) and falls back to driving the
 * registered GSAP timeline directly.
 */
export async function connectLive(iframe: HTMLIFrameElement, timeoutMs = 6000): Promise<LiveController> {
  const win = iframe.contentWindow as CompositionWindow | null;
  if (!win) throw new Error("Composition frame is not available");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((win.__playerReady && win.__player) || (rootTimeline(win) && Date.now() - started > 2500)) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const doc = win.document;
  const { width, height } = compositionSize(doc);
  const tl = rootTimeline(win);
  const player = win.__playerReady ? win.__player : undefined;

  const resolveAt = (x: number, y: number, time: number) => resolveElement(win, tl, x * width, y * height, time, width, height);

  const notComposition = "No timeline registered in window.__timelines — is this a Hyperframes composition?";
  if (player) {
    // The runtime is injected into any page, so a page that isn't a composition still gets a player, with nothing to play.
    const duration = player.getDuration() || tl?.totalDuration() || 0;
    if (!(duration > 0)) throw new Error(notComposition);
    return {
      mode: "hyperframes",
      width,
      height,
      duration,
      play: () => player.play(),
      pause: () => player.pause(),
      seek: (t) => player.seek(t),
      getTime: () => player.getTime(),
      isPlaying: () => player.isPlaying(),
      resolveAt,
    };
  }
  if (!tl || !(tl.totalDuration() > 0)) throw new Error(notComposition);

  // Fallback clock: GSAP plus numeric data-start/data-duration visibility; no media sync.
  const clips = [...doc.querySelectorAll<HTMLElement>("[data-start]")]
    .map((el) => ({ el, start: Number(el.dataset.start), duration: Number(el.dataset.duration) }))
    .filter((c) => Number.isFinite(c.start));
  const syncClips = (time: number) => {
    for (const c of clips) {
      const visible = time >= c.start && (!Number.isFinite(c.duration) || time < c.start + c.duration);
      c.el.style.visibility = visible ? "visible" : "hidden";
    }
  };
  let playing = false;
  let t = 0;
  let last = 0;
  let raf = 0;
  const duration = tl.totalDuration();
  const tick = (now: number) => {
    if (!playing) return;
    t = Math.min(duration, t + (now - last) / 1000);
    last = now;
    tl.seek(t, false);
    syncClips(t);
    if (t >= duration) playing = false;
    else raf = win.requestAnimationFrame(tick);
  };
  tl.pause();
  syncClips(0);
  return {
    mode: "gsap",
    width,
    height,
    duration,
    play: () => {
      if (playing) return;
      if (t >= duration) t = 0;
      playing = true;
      last = win.performance.now();
      raf = win.requestAnimationFrame(tick);
    },
    pause: () => {
      playing = false;
      win.cancelAnimationFrame(raf);
    },
    seek: (next) => {
      t = Math.max(0, Math.min(duration, next));
      tl.seek(t, false);
      syncClips(t);
    },
    getTime: () => t,
    isPlaying: () => playing,
    resolveAt,
  };
}

function cssEscape(win: Window, s: string) {
  return (win as Window & { CSS?: { escape(s: string): string } }).CSS?.escape(s) ?? s;
}

export function selectorFor(el: Element, win: Window): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node.tagName !== "HTML" && node.tagName !== "BODY") {
    if (node.id) {
      parts.unshift(`#${cssEscape(win, node.id)}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    const classes = [...node.classList].filter((c) => c !== "clip").slice(0, 2);
    if (classes.length) part += classes.map((c) => `.${cssEscape(win, c)}`).join("");
    const parent: Element | null = node.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === node!.tagName && c.className === node!.className);
      if (same.length > 1) part += `:nth-of-type(${[...parent.children].filter((c) => c.tagName === node!.tagName).indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ") || el.tagName.toLowerCase();
}

function absoluteStart(anim: GsapAnimation, root: GsapTimeline): number {
  let t = anim.startTime();
  let p = anim.parent;
  while (p && p !== root) {
    t += p.startTime();
    p = p.parent;
  }
  return t;
}

function simpleProps(vars: Record<string, unknown>): Record<string, string | number | boolean> {
  const skip = new Set(["ease", "duration", "delay", "stagger", "onComplete", "onStart", "onUpdate", "immediateRender", "overwrite", "id", "startAt", "runBackwards", "parent"]);
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (skip.has(k)) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

function tweensFor(win: Window, root: GsapTimeline | undefined, el: Element, time: number): TweenInfo[] {
  if (!root) return [];
  const chain = new Set<Element>();
  for (let n: Element | null = el; n; n = n.parentElement) chain.add(n);
  const related = root
    .getChildren(true, true, false)
    .filter((tw) => typeof tw.targets === "function")
    .map((tw) => {
      const targets = (tw.targets!() as unknown[]).filter((t): t is Element => t instanceof (win as unknown as { Element: typeof Element }).Element);
      const start = absoluteStart(tw, root);
      return { tw, targets, start, end: start + tw.duration() };
    })
    .filter((x) => x.targets.some((t) => chain.has(t)));
  // Prefer tweens on the element itself over ancestors.
  const depth = (x: (typeof related)[number]) => {
    let d = 0;
    for (let n: Element | null = el; n; n = n.parentElement, d++) if (x.targets.includes(n)) return d;
    return 99;
  };
  const toInfo = (x: (typeof related)[number], relation: TweenInfo["relation"]): TweenInfo => ({
    targets: [...new Set(x.targets.map((t) => selectorFor(t, win)))].slice(0, 4),
    start: Math.round(x.start * 1000) / 1000,
    end: Math.round(x.end * 1000) / 1000,
    ease: typeof x.tw.vars.ease === "string" ? x.tw.vars.ease : undefined,
    props: simpleProps(x.tw.vars),
    relation,
  });
  const eps = 1e-3;
  const active = related.filter((x) => x.start - eps <= time && time <= x.end + eps).sort((a, b) => depth(a) - depth(b));
  if (active.length) return active.slice(0, 3).map((x) => toInfo(x, "active"));
  const prev = related.filter((x) => x.end < time).sort((a, b) => b.end - a.end || depth(a) - depth(b))[0];
  const next = related.filter((x) => x.start > time).sort((a, b) => a.start - b.start || depth(a) - depth(b))[0];
  return [prev && toInfo(prev, "previous"), next && toInfo(next, "next")].filter(Boolean) as TweenInfo[];
}

function resolveElement(
  win: Window,
  tl: GsapTimeline | undefined,
  px: number,
  py: number,
  time: number,
  width: number,
  height: number,
): ElementInfo | undefined {
  const doc = win.document;
  const stack = doc.elementsFromPoint(px, py).filter((el) => {
    if (el === doc.documentElement || el === doc.body) return false;
    const style = win.getComputedStyle(el);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    return true;
  });
  if (!stack.length) return undefined;
  // Prefer the top-most element that isn't a full-frame container.
  const isFullFrame = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width >= width * 0.98 && r.height >= height * 0.98;
  };
  const el = stack.find((e) => !isFullFrame(e)) ?? stack[0];
  const r = el.getBoundingClientRect();
  const clipEl = el.closest("[data-start]");
  const text = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
  return {
    selector: selectorFor(el, win),
    tagName: el.tagName.toLowerCase(),
    text: text ? text.slice(0, 160) : undefined,
    rect: {
      x: round(r.left / width),
      y: round(r.top / height),
      width: round(r.width / width),
      height: round(r.height / height),
    },
    clip: clipEl
      ? {
          selector: selectorFor(clipEl, win),
          start: clipEl.getAttribute("data-start") ?? undefined,
          duration: clipEl.getAttribute("data-duration") ?? undefined,
          trackIndex: clipEl.getAttribute("data-track-index") ?? undefined,
        }
      : undefined,
    tweens: tweensFor(win, tl, el, time),
  };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

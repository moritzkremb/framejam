import { ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { formatTime } from "@/lib/api";
import { cn, MOD_KEY } from "@/lib/utils";

export interface Marker {
  id: string;
  index: number;
  time: number;
  endTime?: number;
  /** About the whole video: listed beside the scale instead of at a time. */
  whole?: boolean;
  sent: boolean;
}

const frameCache = new Map<string, string[]>();

/** Grabs `count` evenly spaced frames from a video file, in the browser (no ffmpeg needed). */
function useFrames(url: string | undefined, count: number) {
  const [frames, setFrames] = useState<string[] | null>(url ? (frameCache.get(url) ?? null) : null);
  useEffect(() => {
    if (!url) return setFrames(null);
    const cached = frameCache.get(url);
    if (cached) return setFrames(cached);
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    const seek = (t: number) =>
      new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = t;
      });
    video.onloadeddata = async () => {
      const out: string[] = [];
      const h = 72;
      const w = Math.round((video.videoWidth / video.videoHeight) * h) || 128;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      for (let i = 0; i < count && !cancelled; i++) {
        await seek(((i + 0.5) / count) * video.duration);
        ctx.drawImage(video, 0, 0, w, h);
        out.push(canvas.toDataURL("image/jpeg", 0.6));
      }
      if (!cancelled) {
        frameCache.set(url, out);
        setFrames(out);
      }
      video.removeAttribute("src");
      video.load();
    };
    return () => {
      cancelled = true;
    };
  }, [url, count]);
  return frames;
}

/** Narrowest window (seconds) the timeline zooms into. */
const MIN_SPAN = 1;

type View = { zoom: number; start: number };

function fitView(v: View, d: number): View {
  const zoom = Math.max(1, Math.min(Math.max(1, d / MIN_SPAN), v.zoom));
  return { zoom, start: Math.max(0, Math.min(d - d / zoom, v.start)) };
}

/** The part of the video the timeline shows: zoom 1 is the whole video, zoom 4 a quarter starting at `start`. */
export function useTimelineZoom(duration: number) {
  const d = duration || 1;
  // Tagged with the duration it was set for, so a different video starts fully zoomed out.
  const [raw, setRaw] = useState<View & { d: number }>({ d, zoom: 1, start: 0 });
  const view = fitView(raw.d === d ? raw : { zoom: 1, start: 0 }, d);
  const update = useCallback(
    (next: (cur: View) => View) =>
      setRaw((v) => {
        const n = fitView(next(fitView(v.d === d ? v : { zoom: 1, start: 0 }, d)), d);
        return v.d === d && n.zoom === v.zoom && n.start === v.start ? v : { ...n, d };
      }),
    [d],
  );
  /** Zooms by `factor`, keeping the time at `frac` (0 = left edge, 1 = right edge) where it is on screen. */
  const zoomAt = useCallback(
    (factor: number, frac: number) =>
      update((cur) => {
        const at = cur.start + frac * (d / cur.zoom);
        const zoom = fitView({ zoom: cur.zoom * factor, start: 0 }, d).zoom;
        return { zoom, start: at - frac * (d / zoom) };
      }),
    [d, update],
  );
  const panBy = useCallback((dt: number) => update((cur) => ({ ...cur, start: cur.start + dt })), [update]);
  const panTo = useCallback((start: number) => update((cur) => ({ ...cur, start })), [update]);
  /** Scrolls just far enough to bring `t` into view. */
  const reveal = useCallback(
    (t: number) =>
      update((cur) => {
        const s = d / cur.zoom;
        return t < cur.start ? { ...cur, start: t } : t > cur.start + s ? { ...cur, start: t - s } : cur;
      }),
    [d, update],
  );
  return { zoom: view.zoom, start: view.start, span: d / view.zoom, maxZoom: Math.max(1, d / MIN_SPAN), zoomAt, panBy, panTo, reveal };
}

export type TimelineZoom = ReturnType<typeof useTimelineZoom>;

/** Zoom out, the zoom level (click to fit the whole video), zoom in. Buttons zoom around the playhead when it's in view. */
export function ZoomControls({ zoom, time }: { zoom: TimelineZoom; time: number }) {
  const frac = time >= zoom.start && time <= zoom.start + zoom.span ? (time - zoom.start) / zoom.span : 0.5;
  const hint = `pinch or ${MOD_KEY} + scroll on the timeline`;
  return (
    <div className="fc-zoom" role="group" aria-label="Timeline zoom">
      <button type="button" className="fc-btn ghost icon sm round" aria-label="Zoom out" title={`Zoom out (${hint})`} disabled={zoom.zoom <= 1} onClick={() => zoom.zoomAt(0.5, frac)}>
        <ZoomOut className="fc-i sm" />
      </button>
      {zoom.zoom > 1 && (
        <button type="button" className="fc-btn ghost sm lvl" title="Show the whole video" onClick={() => zoom.zoomAt(1 / zoom.zoom, 0)}>
          {zoom.zoom < 10 ? zoom.zoom.toFixed(1).replace(/\.0$/, "") : Math.round(zoom.zoom)}×
        </button>
      )}
      <button type="button" className="fc-btn ghost icon sm round" aria-label="Zoom in" title={`Zoom in (${hint})`} disabled={zoom.zoom >= zoom.maxZoom} onClick={() => zoom.zoomAt(2, frac)}>
        <ZoomIn className="fc-i sm" />
      </button>
    </div>
  );
}

interface FilmstripProps {
  duration: number;
  time: number;
  zoom: TimelineZoom;
  markers: Marker[];
  /** Range currently attached to the comment box. */
  range: { start: number; end: number } | null;
  selectedId: string | null;
  frameSource?: string;
  /** Dragging across the strip picks a range (only while the version is open). */
  canSelectRange: boolean;
  /** The comment box is set to "Whole video". */
  wholeActive: boolean;
  onSeek(t: number): void;
  onScrubStart(): void;
  onRange(start: number, end: number): void;
  onClearRange(): void;
  onSelect(id: string): void;
}

const COUNT = 12;
const MARKER_GAP = 21;
/** How close (px) the pointer must be to a range edge or the playhead to grab it. */
const GRAB = 8;
/** Pointer travel (px) before a press counts as a drag rather than a click. */
const DRAG_PX = 4;
const MIN_RANGE = 0.1;

type Zone = "start" | "end" | "body" | "strip";

type Span = { start: number; end: number };

interface Drag {
  /** "edge" covers both drawing a new range and resizing one: one end stays fixed, the pointer is the other. */
  mode: "scrub" | "edge" | "move";
  x0: number;
  t0: number;
  /** The end that stays put while drawing or resizing. */
  fixed: number;
  /** The range when a move began. */
  from: Span | null;
  live: Span | null;
  moved: boolean;
}

const ZONE_CURSOR: Record<Zone, string> = { start: "ew-resize", end: "ew-resize", body: "grab", strip: "pointer" };

/**
 * A filmstrip timeline. Click to jump; drag the strip to pick a range; drag a range's edges to
 * resize it or its middle to move it; drag the playhead's knob to scrub. The playhead follows whatever is dragged.
 * Zoomed in, it shows `zoom.start` to `zoom.start + zoom.span`: horizontal scrolling and the bar underneath pan,
 * and the view follows the playhead.
 */
export function Filmstrip({ duration, time, zoom, markers, range, selectedId, frameSource, canSelectRange, wholeActive, onSeek, onScrubStart, onRange, onClearRange, onSelect }: FilmstripProps) {
  const timed = markers.filter((m) => !m.whole);
  const whole = markers.filter((m) => m.whole);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const barGrab = useRef<number | null>(null);
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
  });
  const { reveal } = zoom;
  useEffect(() => reveal(time), [time, reveal]);

  // Pinch (a ctrl+wheel in Chromium, gesture events in Safari) and Cmd/Ctrl+scroll zoom; sideways scrolling pans.
  // Listeners are non-passive so the page itself doesn't zoom or swipe back.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fracAt = (clientX: number) => {
      const r = stripRef.current!.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    };
    const onWheel = (e: WheelEvent) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomRef.current.zoomAt(Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.01), fracAt(e.clientX));
        return;
      }
      const z = zoomRef.current;
      const sideways = Math.abs(dx) > Math.abs(dy) ? dx : e.shiftKey ? dy : 0;
      if (z.zoom <= 1 || !sideways) return;
      e.preventDefault();
      z.panBy((sideways / stripRef.current!.clientWidth) * z.span);
    };
    let lastScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number };
      zoomRef.current.zoomAt(g.scale / lastScale, fracAt(g.clientX));
      lastScale = g.scale;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
    };
  }, []);
  const [stripWidth, setStripWidth] = useState(0);
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStripWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ t: number; zone: Zone } | null>(null);
  const frames = useFrames(frameSource, COUNT);
  const d = duration || 1;
  const { start: viewStart, span } = zoom;
  const zoomed = zoom.zoom > 1;
  const clamp = (t: number) => Math.max(0, Math.min(d, t));
  /** Where `t` sits in the visible window: 0 at the left edge, 1 at the right. */
  const rel = (t: number) => (t - viewStart) / span;
  const inView = (t: number) => rel(t) >= -1e-6 && rel(t) <= 1 + 1e-6;
  const pct = (t: number) => `${Math.max(0, Math.min(1, rel(t))) * 100}%`;
  /** A span clipped to the window, or null when none of it is in view. */
  const clip = (a: number, b: number) => {
    const l = Math.max(0, rel(a));
    const r = Math.min(1, rel(b));
    if (r < l || (r === l && b > a)) return null;
    return { style: { left: `${l * 100}%`, width: `${(r - l) * 100}%` }, cutStart: rel(a) < 0, cutEnd: rel(b) > 1 };
  };
  // Not clamped to the window: dragging past an edge scrolls the view along (the playhead is kept in view).
  const timeAt = (clientX: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    return clamp(viewStart + ((clientX - r.left) / r.width) * span);
  };
  const px = (t: number) => rel(t) * (stripRef.current?.clientWidth ?? stripWidth);

  const zoneAt = (t: number): Zone => {
    const x = px(t);
    if (range && canSelectRange) {
      const ds = Math.abs(x - px(range.start));
      const de = Math.abs(x - px(range.end));
      if (Math.min(ds, de) <= GRAB) return ds < de ? "start" : "end";
      if (t > range.start && t < range.end) return "body";
    }
    return "strip";
  };

  const shownRange = drag?.live ?? range;
  const cursor = drag ? (drag.mode === "move" ? "grabbing" : "ew-resize") : ZONE_CURSOR[hover?.zone ?? "strip"];
  const tip = drag?.moved ? time : !drag && hover ? hover.t : null;

  const onDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-marker]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const onKnob = !!(e.target as HTMLElement).closest("[data-head]");
    const t = onKnob ? time : timeAt(e.clientX);
    const zone = zoneAt(t);
    onScrubStart();
    const base = { x0: e.clientX, t0: t, fixed: t, from: null, live: null, moved: false };
    if (onKnob) return setDrag({ ...base, mode: "scrub" });
    if (zone === "start" || zone === "end") {
      onSeek(range![zone]);
      return setDrag({ ...base, mode: "edge", fixed: zone === "start" ? range!.end : range!.start, live: range });
    }
    onSeek(t);
    if (zone === "body") return setDrag({ ...base, mode: "move", from: range });
    if (!canSelectRange) return setDrag({ ...base, mode: "scrub" });
    if (range) onClearRange();
    setDrag({ ...base, mode: "edge" });
  };

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const t = timeAt(e.clientX);
    if (!drag) return e.currentTarget === stripRef.current ? setHover({ t, zone: zoneAt(t) }) : undefined;
    if (!drag.moved && Math.abs(e.clientX - drag.x0) <= DRAG_PX) return;
    if (drag.mode === "move") {
      const { start, end } = drag.from!;
      const shift = Math.max(-start, Math.min(d - end, t - drag.t0));
      onSeek(start + shift);
      return setDrag({ ...drag, moved: true, live: { start: start + shift, end: end + shift } });
    }
    onSeek(t);
    setDrag({ ...drag, moved: true, live: drag.mode === "edge" ? { start: Math.min(drag.fixed, t), end: Math.max(drag.fixed, t) } : null });
  };

  const onUp = () => {
    if (!drag) return;
    setDrag(null);
    const live = drag.live;
    if (drag.moved && live && live.end - live.start >= MIN_RANGE) onRange(live.start, live.end);
  };

  // Markers closer than one marker's width are nudged right so each stays readable and clickable.
  const nudge = new Map<string, number>();
  let lastX = -Infinity;
  const shownMarks = timed.filter((m) => inView(m.time));
  for (const m of [...shownMarks].sort((a, b) => a.time - b.time || a.index - b.index)) {
    const x = rel(m.time) * stripWidth;
    const placed = Math.max(x, lastX + MARKER_GAP);
    nudge.set(m.id, placed - x);
    lastX = placed;
  }

  // The overview bar under a zoomed strip: drag the window, or click to center it there.
  const barTime = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * d;
  };
  const onBarDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = barTime(e.clientX);
    const onThumb = t >= viewStart && t <= viewStart + span;
    barGrab.current = onThumb ? t - viewStart : span / 2;
    if (!onThumb) zoom.panTo(t - span / 2);
  };
  const onBarMove = (e: PointerEvent<HTMLDivElement>) => {
    if (barGrab.current !== null) zoom.panTo(barTime(e.clientX) - barGrab.current);
  };

  const rangeBox = shownRange && clip(shownRange.start, shownRange.end);

  return (
    <div ref={rootRef} className="fc-timeline" style={{ userSelect: "none" }}>
      <div
        ref={stripRef}
        className={cn("fc-strip", zoomed && "zoomed")}
        data-testid="timeline-scrub"
        style={{ cursor }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="track" style={{ left: `${rel(0) * 100}%`, width: `${zoom.zoom * 100}%` }}>
          {Array.from({ length: COUNT }, (_, i) => (
            <div key={i} className="f" style={frames?.[i] ? { backgroundImage: `url(${frames[i]})` } : undefined} />
          ))}
        </div>
        <div className="played" style={{ width: pct(time) }} />
        {rangeBox && (
          <div
            className={cn("fc-range in-strip", drag?.live && "is-dragging", rangeBox.cutStart && "cut-start", rangeBox.cutEnd && "cut-end")}
            style={rangeBox.style}
          />
        )}
        {!shownRange && (wholeActive || whole.some((m) => m.id === selectedId)) && <div className="fc-whole-outline" />}
      </div>
      {zoomed && (
        <div
          ref={barRef}
          className="fc-zoom-bar"
          title="Drag to move along the video"
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={() => (barGrab.current = null)}
          onPointerCancel={() => (barGrab.current = null)}
        >
          <div className="thumb" style={{ left: `${(viewStart / d) * 100}%`, width: `${(span / d) * 100}%` }} />
        </div>
      )}
      {tip !== null && inView(tip) && (
        <span className="fc-hover-time" style={{ left: pct(tip) }}>
          {formatTime(tip)}
        </span>
      )}
      {timed
        .filter((m) => m.endTime !== undefined)
        .map((m) => {
          const box = clip(m.time, m.endTime!);
          return box && <span key={`${m.id}-span`} className={cn("fc-mark-span", m.sent ? "sent" : "draft")} style={box.style} />;
        })}
      {shownMarks.map((m) => (
        <button
          key={m.id}
          data-marker
          type="button"
          title={`${formatTime(m.time)}${m.endTime !== undefined ? ` – ${formatTime(m.endTime)}` : ""}`}
          className={cn("fc-mark", m.sent ? "sent" : "draft", selectedId === m.id && "is-selected")}
          style={{ left: `calc(${pct(m.time)} + ${nudge.get(m.id) ?? 0}px)` }}
          onClick={() => onSelect(m.id)}
        >
          {m.index}
        </button>
      ))}
      {inView(time) && (
        <div className={cn("fc-head", drag?.mode === "scrub" && "is-dragging")} style={{ left: pct(time) }}>
          <span className="grip" data-head title="Drag to scrub" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)} />
        </div>
      )}
      <div className="fc-scale">
        <span>{formatTime(viewStart, false)}</span>
        <span className="fc-scale-mid">
          {whole.length > 0 && (
            <span className="fc-whole-marks">
              Whole video
              {whole.map((m) => (
                <button
                  key={m.id}
                  data-marker
                  type="button"
                  title="About the whole video"
                  className={cn("fc-mark inline", m.sent ? "sent" : "draft", selectedId === m.id && "is-selected")}
                  onClick={() => onSelect(m.id)}
                >
                  {m.index}
                </button>
              ))}
            </span>
          )}
          {!canSelectRange || wholeActive ? null : range ? (
            <span className="fc-t3">Drag the edges to resize · click outside to clear</span>
          ) : markers.length ? null : (
            <span className="fc-t3">Drag across to comment on a range</span>
          )}
        </span>
        <span>{formatTime(zoomed ? viewStart + span : duration, false)}</span>
      </div>
    </div>
  );
}

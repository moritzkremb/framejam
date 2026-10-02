import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { formatTime } from "@/lib/api";
import { cn } from "@/lib/utils";

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

interface FilmstripProps {
  duration: number;
  time: number;
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
 */
export function Filmstrip({ duration, time, markers, range, selectedId, frameSource, canSelectRange, wholeActive, onSeek, onScrubStart, onRange, onClearRange, onSelect }: FilmstripProps) {
  const timed = markers.filter((m) => !m.whole);
  const whole = markers.filter((m) => m.whole);
  const stripRef = useRef<HTMLDivElement>(null);
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
  const clamp = (t: number) => Math.max(0, Math.min(d, t));
  const pct = (t: number) => `${Math.max(0, Math.min(1, t / d)) * 100}%`;
  const timeAt = (clientX: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    return clamp(((clientX - r.left) / r.width) * d);
  };
  const px = (t: number) => (t / d) * (stripRef.current?.clientWidth ?? stripWidth);

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
  for (const m of [...timed].sort((a, b) => a.time - b.time || a.index - b.index)) {
    const x = (m.time / d) * stripWidth;
    const placed = Math.max(x, lastX + MARKER_GAP);
    nudge.set(m.id, placed - x);
    lastX = placed;
  }

  return (
    <div className="fc-timeline" style={{ userSelect: "none" }}>
      <div
        ref={stripRef}
        className="fc-strip"
        data-testid="timeline-scrub"
        style={{ cursor }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        {Array.from({ length: COUNT }, (_, i) => (
          <div key={i} className="f" style={frames?.[i] ? { backgroundImage: `url(${frames[i]})` } : undefined} />
        ))}
        <div className="played" style={{ width: pct(time) }} />
        {shownRange && <div className={cn("fc-range in-strip", drag?.live && "is-dragging")} style={{ left: pct(shownRange.start), width: pct(shownRange.end - shownRange.start) }} />}
        {!shownRange && (wholeActive || whole.some((m) => m.id === selectedId)) && <div className="fc-whole-outline" />}
      </div>
      {tip !== null && (
        <span className="fc-hover-time" style={{ left: pct(tip) }}>
          {formatTime(tip)}
        </span>
      )}
      {timed
        .filter((m) => m.endTime !== undefined)
        .map((m) => (
          <span
            key={`${m.id}-span`}
            className={cn("fc-mark-span", m.sent ? "sent" : "draft")}
            style={{ left: pct(m.time), width: pct(m.endTime! - m.time) }}
          />
        ))}
      {timed.map((m) => (
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
      <div className={cn("fc-head", drag?.mode === "scrub" && "is-dragging")} style={{ left: pct(time) }}>
        <span className="grip" data-head title="Drag to scrub" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)} />
      </div>
      <div className="fc-scale">
        <span>{formatTime(0, false)}</span>
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
        <span>{formatTime(duration, false)}</span>
      </div>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface Marker {
  id: string;
  index: number;
  time: number;
  endTime?: number;
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
  onSeek(t: number): void;
  onScrubStart(): void;
  onRange(start: number, end: number): void;
  onSelect(id: string): void;
}

const COUNT = 12;
const MARKER_GAP = 21;

/** A filmstrip you can click (jump), drag across (pick a range), or scrub by its playhead. */
export function Filmstrip({ duration, time, markers, range, selectedId, frameSource, canSelectRange, onSeek, onScrubStart, onRange, onSelect }: FilmstripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripWidth, setStripWidth] = useState(0);
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStripWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [drag, setDrag] = useState<{ mode: "range" | "scrub"; start: number; end: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const frames = useFrames(frameSource, COUNT);
  const d = duration || 1;
  const pct = (t: number) => `${Math.max(0, Math.min(1, t / d)) * 100}%`;
  const timeAt = (clientX: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(d, ((clientX - r.left) / r.width) * d));
  };

  const shownRange = drag?.mode === "range" && drag.moved ? { start: Math.min(drag.start, drag.end), end: Math.max(drag.start, drag.end) } : range;

  // Markers closer than one marker's width are nudged right so each stays readable and clickable.
  const nudge = new Map<string, number>();
  let lastX = -Infinity;
  for (const m of [...markers].sort((a, b) => a.time - b.time || a.index - b.index)) {
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
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-marker]")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const t = timeAt(e.clientX);
          const onHead = Math.abs(t - time) / d < 0.02;
          onScrubStart();
          if (onHead || !canSelectRange) onSeek(t);
          setDrag({ mode: onHead || !canSelectRange ? "scrub" : "range", start: t, end: t, moved: false });
        }}
        onPointerMove={(e) => {
          const t = timeAt(e.clientX);
          setHover(t);
          if (!drag) return;
          if (drag.mode === "scrub") return onSeek(t);
          setDrag({ ...drag, end: t, moved: drag.moved || Math.abs(t - drag.start) / d > 0.01 });
        }}
        onPointerLeave={() => setHover(null)}
        onPointerUp={() => {
          if (!drag) return;
          if (drag.mode === "range") {
            if (drag.moved && Math.abs(drag.end - drag.start) > 0.05) onRange(Math.min(drag.start, drag.end), Math.max(drag.start, drag.end));
            else onSeek(drag.start);
          }
          setDrag(null);
        }}
      >
        {Array.from({ length: COUNT }, (_, i) => (
          <div key={i} className="f" style={frames?.[i] ? { backgroundImage: `url(${frames[i]})` } : undefined} />
        ))}
        <div className="played" style={{ width: pct(time) }} />
        {shownRange && <div className="fc-range in-strip" style={{ left: pct(shownRange.start), width: pct(shownRange.end - shownRange.start) }} />}
        {hover !== null && !drag && (
          <span className="fc-hover-time" style={{ left: pct(hover) }}>
            {formatTime(hover)}
          </span>
        )}
      </div>
      {markers
        .filter((m) => m.endTime !== undefined)
        .map((m) => (
          <span
            key={`${m.id}-span`}
            className={cn("fc-mark-span", m.sent ? "sent" : "draft")}
            style={{ left: pct(m.time), width: pct(m.endTime! - m.time) }}
          />
        ))}
      {markers.map((m) => (
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
      <div className="fc-head" style={{ left: pct(time) }} />
      <div className="fc-scale">
        <span>{formatTime(0, false)}</span>
        {!canSelectRange || markers.length ? null : <span className="fc-t3">Drag across to comment on a range</span>}
        <span>{formatTime(duration, false)}</span>
      </div>
    </div>
  );
}

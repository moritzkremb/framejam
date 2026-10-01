import { useRef, useState } from "react";
import { formatTime, type ReviewComment } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TimelineProps {
  duration: number;
  time: number;
  markers: { comment: ReviewComment; index: number; faded: boolean }[];
  draftRange: { start: number; end?: number } | null;
  selectedId: string | null;
  onSeek(t: number): void;
  onScrubStart?(): void;
  onRange(start: number, end: number): void;
  onSelect(id: string): void;
}

const statusColor: Record<ReviewComment["status"], string> = {
  draft: "bg-primary",
  sent: "bg-sky-400",
  resolved: "bg-emerald-500",
};

export function Timeline({ duration, time, markers, draftRange, selectedId, onSeek, onScrubStart, onRange, onSelect }: TimelineProps) {
  const scrubRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: number; end: number; moved: boolean } | null>(null);
  const d = duration || 1;
  const pct = (t: number) => `${Math.max(0, Math.min(1, t / d)) * 100}%`;

  const timeAt = (el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(d, ((clientX - r.left) / r.width) * d));
  };

  const ticks = [];
  const step = d > 120 ? 30 : d > 40 ? 10 : d > 12 ? 2 : 1;
  for (let t = 0; t <= d + 1e-6; t += step) ticks.push(t);

  return (
    <div className="select-none">
      {/* Scrub bar */}
      <div
        ref={scrubRef}
        data-testid="timeline-scrub"
        className="group relative h-7 cursor-pointer"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onScrubStart?.();
          onSeek(timeAt(e.currentTarget, e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) onSeek(timeAt(e.currentTarget, e.clientX));
        }}
      >
        <div className="absolute inset-x-0 top-0 h-3">
          {ticks.map((t) => (
            <span key={t} className="absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ left: pct(t) }}>
              {formatTime(t, false)}
            </span>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-1.5 h-1.5 rounded-full bg-secondary">
          <div className="h-full rounded-full bg-foreground/70" style={{ width: pct(time) }} />
        </div>
        <div
          className="absolute bottom-0.5 size-3.5 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow transition-transform group-hover:scale-110"
          style={{ left: pct(time) }}
        />
      </div>

      {/* Comment lane: click to seek, drag to mark a range */}
      <div
        ref={laneRef}
        data-testid="timeline-lane"
        className="relative mt-1.5 h-9 cursor-text rounded-md border border-dashed border-white/10 bg-secondary/40"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-marker]")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const t = timeAt(e.currentTarget, e.clientX);
          setDrag({ start: t, end: t, moved: false });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const t = timeAt(e.currentTarget, e.clientX);
          const moved = drag.moved || Math.abs(t - drag.start) / d > 0.008;
          setDrag({ ...drag, end: t, moved });
        }}
        onPointerUp={() => {
          if (!drag) return;
          if (drag.moved && Math.abs(drag.end - drag.start) > 0.05) {
            onRange(Math.min(drag.start, drag.end), Math.max(drag.start, drag.end));
          } else {
            onSeek(drag.start);
          }
          setDrag(null);
        }}
      >
        {markers.length === 0 && !drag && !draftRange && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">
            Drag here to comment on a time range
          </span>
        )}
        {markers.map(({ comment, index, faded }) => {
          const isRange = comment.endTime !== undefined;
          return (
            <button
              key={comment.id}
              data-marker
              type="button"
              title={`${formatTime(comment.time)} — ${comment.text}`}
              onClick={() => onSelect(comment.id)}
              className={cn(
                "absolute top-1/2 h-6 -translate-y-1/2 rounded-md text-[10px] font-semibold text-black/80 shadow ring-1 ring-black/30 transition-[opacity,transform] hover:z-10 hover:scale-y-110",
                statusColor[comment.status],
                isRange ? "min-w-1.5 opacity-80" : "w-5 -translate-x-1/2",
                faded && "opacity-35",
                selectedId === comment.id && "z-10 ring-2 ring-white",
              )}
              style={
                isRange
                  ? { left: pct(comment.time), width: `calc(${pct(comment.endTime! - comment.time)})` }
                  : { left: pct(comment.time) }
              }
            >
              {index}
            </button>
          );
        })}
        {(drag?.moved || draftRange?.end !== undefined) && (
          <div
            className="pointer-events-none absolute inset-y-0.5 rounded bg-primary/30 ring-1 ring-primary"
            style={(() => {
              const a = drag ? Math.min(drag.start, drag.end) : draftRange!.start;
              const b = drag ? Math.max(drag.start, drag.end) : draftRange!.end!;
              return { left: pct(a), width: pct(b - a) };
            })()}
          />
        )}
        <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground/60" style={{ left: pct(time) }} />
      </div>
    </div>
  );
}

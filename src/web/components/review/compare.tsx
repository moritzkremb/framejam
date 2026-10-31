import { ChevronLeft, Link2, Pause, Play, Unlink2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu, MenuItem } from "@/components/menu";
import { formatTime, relativeTime, type Review } from "@/lib/api";
import type { ReviewDataSource } from "@/lib/data-source";
import { cn } from "@/lib/utils";

/** How far the two videos may drift apart while they play together before the second is pulled back, in seconds. */
const DRIFT = 0.12;

export function comparableVersions(review: Review, data: ReviewDataSource) {
  return review.versions.filter((v) => !v.panels?.length && data.videoUrl(review.id, v.number));
}

function VersionPick({ label, review, versions, value, onPick }: { label: string; review: Review; versions: number[]; value: number; onPick(n: number): void }) {
  return (
    <Menu
      label={label}
      align="start"
      trigger={
        <button type="button" className="fc-btn sm" data-testid={`compare-pick-${label.toLowerCase()}`}>
          {label}: v{value}
        </button>
      }
    >
      {versions.map((n) => {
        const v = review.versions.find((x) => x.number === n)!;
        return (
          <MenuItem key={n} checked={n === value} hint={relativeTime(v.createdAt)} onSelect={() => onPick(n)}>
            v{n}
            {v.note ? ` · ${v.note}` : ""}
          </MenuItem>
        );
      })}
    </Menu>
  );
}

/**
 * Two versions of a video side by side. Synced: one play button and one timeline drive both, so you see the same moment
 * in each. Free: each video has its own controls. On a phone the two stack.
 */
export function ComparePage({ review, data, initial, onClose }: { review: Review; data: ReviewDataSource; initial: [number, number]; onClose(): void }) {
  const options = useMemo(() => comparableVersions(review, data).map((v) => v.number), [review, data]);
  const [a, setA] = useState(initial[0]);
  const [b, setB] = useState(initial[1]);
  const [synced, setSynced] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const refA = useRef<HTMLVideoElement>(null);
  const refB = useRef<HTMLVideoElement>(null);

  const srcA = data.videoUrl(review.id, a);
  const srcB = data.videoUrl(review.id, b);
  const poster = (n: number) => data.poster?.(review.id, n);

  const measure = useCallback(() => {
    const lengths = [refA.current?.duration, refB.current?.duration].filter((d): d is number => Number.isFinite(d));
    setDuration(lengths.length ? Math.max(...lengths) : 0);
  }, []);

  // The shared playhead follows the first video; the second is held to it.
  useEffect(() => {
    if (!synced) return;
    let raf = 0;
    const loop = () => {
      const va = refA.current;
      const vb = refB.current;
      if (va) {
        setTime(va.currentTime);
        setPlaying(!va.paused && !va.ended);
        if (vb && !vb.ended && Math.abs(vb.currentTime - va.currentTime) > DRIFT && vb.currentTime < (vb.duration || Infinity) && va.currentTime < (vb.duration || Infinity)) {
          vb.currentTime = va.currentTime;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [synced]);

  const toggle = () => {
    const va = refA.current;
    const vb = refB.current;
    if (!va) return;
    if (va.paused) {
      if (vb) vb.currentTime = va.currentTime;
      void va.play().catch(() => {});
      void vb?.play().catch(() => {});
    } else {
      va.pause();
      vb?.pause();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === " " && synced) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const seek = (t: number) => {
    for (const v of [refA.current, refB.current]) if (v) v.currentTime = Math.min(t, v.duration || t);
    setTime(t);
  };

  const switchMode = (next: boolean) => {
    refA.current?.pause();
    refB.current?.pause();
    setPlaying(false);
    setSynced(next);
  };

  const pickA = (n: number) => {
    setA(n);
    setPlaying(false);
  };
  const pickB = (n: number) => {
    setB(n);
    setPlaying(false);
  };

  return (
    <div className="fc-rshell" data-testid="compare">
      <header className="fc-header has-back">
        <button type="button" className="fc-btn ghost icon round" aria-label="Back to review" onClick={onClose} data-testid="compare-close">
          <ChevronLeft className="fc-i" />
        </button>
        <div className="titles">
          <span className="t" title={review.title}>
            {review.title}
          </span>
          <span className="s">{`Compare v${a} with v${b}`}</span>
        </div>
      </header>
      <div className="fc-compare">
        <div className="fc-compare-bar">
          <VersionPick label="A" review={review} versions={options} value={a} onPick={pickA} />
          <VersionPick label="B" review={review} versions={options} value={b} onPick={pickB} />
          <span className="fc-grow" />
          <button type="button" className={cn("fc-btn sm", synced && "on")} onClick={() => switchMode(!synced)} aria-pressed={synced} data-testid="compare-sync" title={synced ? "Playing together" : "Each video plays on its own"}>
            {synced ? <Link2 className="fc-i xs" /> : <Unlink2 className="fc-i xs" />}
            <span className="lbl">{synced ? "Synced" : "Free"}</span>
          </button>
        </div>
        <div className="fc-compare-stage">
          {(
            [
              ["A", a, srcA, refA],
              ["B", b, srcB, refB],
            ] as const
          ).map(([label, n, src, ref]) => (
            <figure key={label} className="fc-compare-cell" data-testid={`compare-cell-${label.toLowerCase()}`}>
              <video
                ref={ref}
                src={src}
                poster={poster(n)}
                playsInline
                preload="metadata"
                controls={!synced}
                muted={synced ? label === "B" || muted : undefined}
                onLoadedMetadata={measure}
                data-testid={`compare-video-${label.toLowerCase()}`}
              />
              <figcaption>
                <b>v{n}</b>
                <span className="fc-truncate">{review.versions.find((v) => v.number === n)?.note ?? ""}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        {synced && (
          <div className="fc-compare-controls" data-testid="compare-controls">
            <button type="button" className="fc-play" aria-label={playing ? "Pause" : "Play"} onClick={toggle} data-testid="compare-play">
              {playing ? <Pause className="fc-i fill" /> : <Play className="fc-i fill" />}
            </button>
            <span className="fc-readout" data-testid="compare-time">
              {formatTime(time)} <span>/ {formatTime(duration)}</span>
            </span>
            <input
              type="range"
              className="fc-compare-scrub"
              min={0}
              max={duration || 1}
              step={0.01}
              value={Math.min(time, duration || 1)}
              aria-label="Position"
              onChange={(e) => seek(Number(e.target.value))}
              data-testid="compare-scrub"
            />
            <button type="button" className="fc-btn ghost icon sm round" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)}>
              {muted ? <VolumeX className="fc-i sm" /> : <Volume2 className="fc-i sm" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

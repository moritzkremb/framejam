import { Loader2, MessageSquarePlus, Plus, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ElementInfo } from "@/lib/api";
import { connectLivePreview } from "@/lib/live-preview";
import { drawPin } from "@/lib/pin";
import { cn, crossOriginFor } from "@/lib/utils";

export interface MediaController {
  duration: number;
  width: number;
  height: number;
  play(): void;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  isPlaying(): boolean;
  setRate(rate: number): void;
  /** The current frame as a JPEG data URL, with a pin drawn at `pin` (normalized) when given. */
  captureFrame(pin?: { x: number; y: number }): string | undefined;
  /** Live preview only: the element under a normalized point at `time`. */
  resolveAt?(x: number, y: number, time: number): Promise<ElementInfo | undefined>;
}

export interface Pin {
  id: string;
  index: number;
  x: number;
  y: number;
  sent: boolean;
  text: string;
  /** The guest who wrote it, on a shared link. */
  author?: string;
}

/** A comment at the current time that isn't tied to a spot (a range or a plain timestamp). */
export interface FloatingNote {
  id: string;
  index: number;
  sent: boolean;
  text: string;
  author?: string;
}

interface PlayerProps {
  src: string;
  /** Plays this live composition preview in a sandboxed iframe instead of the video at `src`. */
  liveSrc?: string;
  /** The live preview couldn't play; the page goes back to the render. */
  onLiveError?(message: string): void;
  /** Outline of the element the new comment is about, on the live preview. */
  target?: ElementInfo["rect"] | null;
  /** Pins for the comments at the current time; the page decides which ones are in view. */
  pins: Pin[];
  floating: FloatingNote[];
  /** The spot the comment box is attached to, if any. */
  newPin?: { x: number; y: number } | null;
  selectedId: string | null;
  showHint: boolean;
  /** Clicking the picture comments on that spot. Off for sent versions. */
  interactive: boolean;
  className?: string;
  style?: CSSProperties;
  onController(ctrl: MediaController | null): void;
  onFrameClick(x: number, y: number): void;
  onPinClick(id: string): void;
  /** Width of the picture as laid out, so the controls under it can match. */
  onFrameWidth?(width: number): void;
  /** Drawn over the picture, above the pins (the share page's drawing layer). */
  children?: ReactNode;
  /** Replaces the message shown when the video can't load. */
  errorMessage?: string;
}

function videoController(video: HTMLVideoElement): MediaController {
  return {
    duration: video.duration || 0,
    width: video.videoWidth,
    height: video.videoHeight,
    play: () => void video.play().catch(() => {}),
    pause: () => video.pause(),
    seek: (t) => {
      video.currentTime = Math.max(0, Math.min(video.duration || t, t));
    },
    getTime: () => video.currentTime,
    isPlaying: () => !video.paused && !video.ended,
    setRate: (rate) => {
      video.playbackRate = rate;
    },
    captureFrame: (pin) => {
      try {
        const scale = Math.min(1, 640 / (video.videoWidth || 640));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (pin) drawPin(canvas, pin.x, pin.y);
        return canvas.toDataURL("image/jpeg", 0.85);
      } catch {
        return undefined;
      }
    },
  };
}

/** Largest box of the given aspect that fits the element. */
function useFitBox(aspect: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.min(width, height * aspect);
      setBox({ width: Math.floor(w), height: Math.floor(w / aspect) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);
  return { ref, box };
}

/** The video well: footage on black, comment pins on top. Clicking the picture is the main way to comment. */
export function Player({ src, liveSrc, onLiveError, target, pins, floating, newPin, selectedId, showHint, interactive, className, style, onController, onFrameClick, onPinClick, onFrameWidth, children, errorMessage }: PlayerProps) {
  const [native, setNative] = useState({ width: 1920, height: 1080 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const { ref, box } = useFitBox(native.width / native.height);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onControllerRef = useRef(onController);
  const onLiveErrorRef = useRef(onLiveError);
  useLayoutEffect(() => {
    onControllerRef.current = onController;
    onLiveErrorRef.current = onLiveError;
  });

  useEffect(() => {
    setStatus("loading");
    setError(null);
    return () => onControllerRef.current(null);
  }, [src, liveSrc]);

  // The frame says when the composition is ready, so listen before it loads rather than on its load event.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!liveSrc || !iframe) return;
    let live: Awaited<ReturnType<typeof connectLivePreview>> | null = null;
    let gone = false;
    connectLivePreview(iframe).then(
      (p) => {
        if (gone) return p.dispose();
        live = p;
        setNative({ width: p.width, height: p.height });
        setStatus("ready");
        onControllerRef.current({ ...p, captureFrame: () => undefined });
      },
      (e: Error) => {
        if (gone) return;
        setStatus("error");
        setError(e.message);
        onLiveErrorRef.current?.(e.message);
      },
    );
    return () => {
      gone = true;
      live?.dispose();
    };
  }, [liveSrc]);

  const handleVideoMeta = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.videoWidth && v.videoHeight) setNative({ width: v.videoWidth, height: v.videoHeight });
    setStatus("ready");
    onControllerRef.current(videoController(v));
  }, []);

  useEffect(() => {
    if (box.width) onFrameWidth?.(box.width);
  }, [box.width, onFrameWidth]);

  return (
    <div className={cn("fc-player", className)} style={style}>
      <div ref={ref} className="fc-player-fit">
        <div className="frame" style={{ width: box.width || "100%", height: box.height || "100%" }}>
          {liveSrc ? (
            <div className="fc-live">
              <iframe
                key={liveSrc}
                ref={iframeRef}
                src={liveSrc}
                title="Live preview"
                sandbox="allow-scripts"
                allow="autoplay"
                referrerPolicy="no-referrer"
                tabIndex={-1}
                style={{ width: native.width, height: native.height, transform: `scale(${box.width ? box.width / native.width : 0})` }}
              />
            </div>
          ) : (
            <video
              key={src}
              ref={videoRef}
              src={src}
              crossOrigin={crossOriginFor(src)}
              className="fc-media"
              preload="auto"
              playsInline
              onLoadedMetadata={handleVideoMeta}
              onError={() => {
                setStatus("error");
                setError(errorMessage ?? "This video couldn't be loaded. If the file was moved or deleted, ask your agent to add the render again.");
              }}
            />
          )}

          <div
            data-testid="frame-overlay"
            className={cn("fc-overlay", interactive && "interactive")}
            role="presentation"
            onClick={(e) => {
              if (!interactive) return;
              const r = e.currentTarget.getBoundingClientRect();
              onFrameClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            }}
          >
            {pins.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.author ? `${p.author}: ${p.text}` : p.text}
                aria-label={`Comment ${p.index}${p.author ? ` by ${p.author}` : ""}: ${p.text}`}
                className={cn("fc-pin", p.sent ? "sent" : "draft", selectedId === p.id && "is-selected")}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPinClick(p.id);
                }}
              >
                {p.index}
              </button>
            ))}
            {target && (
              <span
                className="fc-target"
                style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, width: `${target.width * 100}%`, height: `${target.height * 100}%` }}
              />
            )}
            {newPin && (
              <span className="fc-pin new" style={{ left: `${newPin.x * 100}%`, top: `${newPin.y * 100}%` }}>
                <Plus className="fc-i" />
              </span>
            )}
            {floating.length > 0 && (
              <div className="fc-floating">
                {floating.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={cn("fc-note", n.sent ? "sent" : "draft", selectedId === n.id && "is-selected")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPinClick(n.id);
                    }}
                  >
                    <span className="n">{n.index}</span>
                    <span className="fc-truncate">
                      {n.author && <span className="who">{n.author}</span>}
                      {n.text}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {children}

          {status === "loading" && (
            <div className="fc-player-veil">
              <Loader2 className="fc-i fc-spin" />
            </div>
          )}
          {status === "error" && (
            <div className="fc-player-veil error">
              <TriangleAlert className="fc-i" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
      {showHint && interactive && status === "ready" && (
        <span className="tip">
          <MessageSquarePlus className="fc-i xs" /> Click anything to comment on it
        </span>
      )}
    </div>
  );
}

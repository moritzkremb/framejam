import { Loader2, MessageSquarePlus, Plus, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ElementInfo } from "@/lib/api";
import { connectLive } from "@/lib/composition";
import { cn } from "@/lib/utils";

export interface MediaController {
  kind: "video" | "hyperframes" | "gsap";
  duration: number;
  width: number;
  height: number;
  play(): void;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  isPlaying(): boolean;
  /** Live compositions only: the DOM element and tween under a normalized point. */
  resolveAt?(x: number, y: number, time: number): ElementInfo | undefined;
  captureFrame?(): string | undefined;
}

export interface Pin {
  id: string;
  index: number;
  x: number;
  y: number;
  sent: boolean;
  text: string;
}

/** A comment at the current time that isn't tied to a spot (a range or a plain timestamp). */
export interface FloatingNote {
  id: string;
  index: number;
  sent: boolean;
  text: string;
}

interface PlayerProps {
  src: string;
  source: "video" | "live";
  /** Pins for the comments at the current time; the page decides which ones are in view. */
  pins: Pin[];
  floating: FloatingNote[];
  /** The spot the comment box is attached to, if any. */
  newPin?: { x: number; y: number; element?: ElementInfo } | null;
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
}

function videoController(video: HTMLVideoElement): MediaController {
  return {
    kind: "video",
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
    captureFrame: () => {
      try {
        const scale = Math.min(1, 480 / (video.videoWidth || 480));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.82);
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
export function Player({
  src,
  source,
  pins,
  floating,
  newPin,
  selectedId,
  showHint,
  interactive,
  className,
  style,
  onController,
  onFrameClick,
  onPinClick,
  onFrameWidth,
}: PlayerProps) {
  const [native, setNative] = useState({ width: 1920, height: 1080 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const { ref, box } = useFitBox(native.width / native.height);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onControllerRef = useRef(onController);
  useLayoutEffect(() => {
    onControllerRef.current = onController;
  });

  useEffect(() => {
    setStatus("loading");
    setError(null);
    return () => onControllerRef.current(null);
  }, [src, source]);

  const handleVideoMeta = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.videoWidth && v.videoHeight) setNative({ width: v.videoWidth, height: v.videoHeight });
    setStatus("ready");
    onControllerRef.current(videoController(v));
  }, []);

  const handleIframeLoad = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const live = await connectLive(iframe);
      setNative({ width: live.width, height: live.height });
      live.seek(0);
      setStatus("ready");
      onControllerRef.current({
        kind: live.mode,
        duration: live.duration,
        width: live.width,
        height: live.height,
        play: live.play,
        pause: live.pause,
        seek: live.seek,
        getTime: live.getTime,
        isPlaying: live.isPlaying,
        resolveAt: live.resolveAt,
      });
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (box.width) onFrameWidth?.(box.width);
  }, [box.width, onFrameWidth]);

  const scale = box.width / native.width;
  const target = newPin?.element?.rect;

  return (
    <div className={cn("fc-player", className)} style={style}>
      <div ref={ref} className="fc-player-fit">
        <div className="frame" style={{ width: box.width || "100%", height: box.height || "100%" }}>
          {source === "video" ? (
            <video
              key={src}
              ref={videoRef}
              src={src}
              className="fc-media"
              preload="auto"
              playsInline
              onLoadedMetadata={handleVideoMeta}
              onError={() => {
                setStatus("error");
                setError("This video couldn't be loaded.");
              }}
            />
          ) : (
            <iframe
              key={src}
              ref={iframeRef}
              src={src}
              title="Video preview"
              onLoad={handleIframeLoad}
              className="fc-live"
              style={{ width: native.width, height: native.height, transform: `scale(${scale || 0.0001})` }}
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
            {target && (
              <div
                className="fc-target"
                style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, width: `${target.width * 100}%`, height: `${target.height * 100}%` }}
              />
            )}
            {pins.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.text}
                aria-label={`Comment ${p.index}: ${p.text}`}
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
                    <span className="fc-truncate">{n.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

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

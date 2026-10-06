import { Loader2, MessageSquarePlus, Plus, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { drawPin } from "@/lib/pin";
import { cn } from "@/lib/utils";

export interface MediaController {
  duration: number;
  width: number;
  height: number;
  play(): void;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  isPlaying(): boolean;
  /** The current frame as a JPEG data URL, with a pin drawn at `pin` (normalized) when given. */
  captureFrame(pin?: { x: number; y: number }): string | undefined;
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
export function Player({ src, pins, floating, newPin, selectedId, showHint, interactive, className, style, onController, onFrameClick, onPinClick, onFrameWidth }: PlayerProps) {
  const [native, setNative] = useState({ width: 1920, height: 1080 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const { ref, box } = useFitBox(native.width / native.height);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onControllerRef = useRef(onController);
  useLayoutEffect(() => {
    onControllerRef.current = onController;
  });

  useEffect(() => {
    setStatus("loading");
    setError(null);
    return () => onControllerRef.current(null);
  }, [src]);

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
              setError("This video couldn't be loaded. If the file was moved or deleted, ask your agent to add the render again.");
            }}
          />

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

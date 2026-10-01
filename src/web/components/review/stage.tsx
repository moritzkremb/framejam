import { Loader2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { connectLive } from "@/lib/composition";
import type { ElementInfo, ReviewComment } from "@/lib/api";
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
  /** Live mode only: which DOM element and tween sit under a normalized point. */
  resolveAt?(x: number, y: number, time: number): ElementInfo | undefined;
  captureFrame?(): string | undefined;
}

export interface DraftPin {
  x?: number;
  y?: number;
  element?: ElementInfo;
}

interface StageProps {
  src: string;
  source: "video" | "live";
  pins: { comment: ReviewComment; index: number }[];
  draft: DraftPin | null;
  selectedId: string | null;
  onController(ctrl: MediaController | null): void;
  onFrameClick(x: number, y: number): void;
  onPinClick(id: string): void;
}

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

export function Stage({ src, source, pins, draft, selectedId, onController, onFrameClick, onPinClick }: StageProps) {
  const [aspect, setAspect] = useState(16 / 9);
  const [native, setNative] = useState({ width: 1920, height: 1080 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const { ref, box } = useFitBox(aspect);
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
    if (v.videoWidth && v.videoHeight) {
      setAspect(v.videoWidth / v.videoHeight);
      setNative({ width: v.videoWidth, height: v.videoHeight });
    }
    setStatus("ready");
    onControllerRef.current(videoController(v));
  }, []);

  const handleIframeLoad = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const live = await connectLive(iframe);
      setAspect(live.width / live.height);
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

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onFrameClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  const scale = box.width / native.width;

  return (
    <div ref={ref} className="relative grid h-full min-h-[200px] w-full place-items-center">
      <div
        className="checkerboard relative overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10"
        style={{ width: box.width || "100%", height: box.height || "auto" }}
      >
        {source === "video" ? (
          <video
            key={src}
            ref={videoRef}
            src={src}
            className="absolute inset-0 size-full object-contain"
            preload="auto"
            playsInline
            onLoadedMetadata={handleVideoMeta}
            onError={() => {
              setStatus("error");
              setError("The rendered video couldn't be loaded.");
            }}
          />
        ) : (
          <iframe
            key={src}
            ref={iframeRef}
            src={src}
            title="Live composition"
            onLoad={handleIframeLoad}
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-black"
            style={{ width: native.width, height: native.height, transform: `scale(${scale || 0.0001})` }}
          />
        )}

        <div
          data-testid="frame-overlay"
          className="absolute inset-0 cursor-crosshair"
          onClick={handleClick}
          role="presentation"
        >
          {draft?.element?.rect && (
            <div
              className="pointer-events-none absolute rounded-sm border-2 border-dashed border-primary/80 bg-primary/10"
              style={{
                left: `${draft.element.rect.x * 100}%`,
                top: `${draft.element.rect.y * 100}%`,
                width: `${draft.element.rect.width * 100}%`,
                height: `${draft.element.rect.height * 100}%`,
              }}
            />
          )}
          {pins.map(({ comment, index }) => (
            <button
              key={comment.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPinClick(comment.id);
              }}
              className={cn(
                "absolute grid size-7 -translate-x-1/2 -translate-y-full place-items-center rounded-full rounded-bl-none text-xs font-semibold shadow-lg ring-2 ring-black/40 transition-transform hover:scale-110",
                comment.status === "resolved"
                  ? "bg-emerald-500 text-emerald-950"
                  : comment.status === "sent"
                    ? "bg-sky-400 text-sky-950"
                    : "bg-primary text-primary-foreground",
                selectedId === comment.id && "scale-125 ring-white",
              )}
              style={{ left: `${(comment.x ?? 0.5) * 100}%`, top: `${(comment.y ?? 0.5) * 100}%` }}
              title={comment.text}
            >
              {index}
            </button>
          ))}
          {draft && draft.x !== undefined && draft.y !== undefined && (
            <div
              className="pointer-events-none absolute grid size-7 -translate-x-1/2 -translate-y-full animate-in place-items-center rounded-full rounded-bl-none bg-white text-xs font-bold text-black shadow-lg ring-2 ring-primary zoom-in-50"
              style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
            >
              +
            </div>
          )}
        </div>

        {status === "loading" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center text-sm">
            <div className="flex max-w-sm flex-col items-center gap-2">
              <TriangleAlert className="size-5 text-amber-400" />
              {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

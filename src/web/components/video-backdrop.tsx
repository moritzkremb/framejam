import { useEffect, useRef, type RefObject } from "react";

/**
 * The video stretched to cover its frame and blurred, for tall or square examples, instead of black bars. Shows the
 * blurred poster until the video plays, then redraws its frames while it plays.
 */
export function VideoBackdrop({ video, poster }: { video: RefObject<HTMLVideoElement | null>; poster?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const v = video.current;
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!v || !c || !ctx) return;
    let frame = 0;
    const draw = () => {
      if (v.readyState >= 2 && v.videoWidth) {
        const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
        const w = v.videoWidth * scale;
        const h = v.videoHeight * scale;
        ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
      }
    };
    const loop = () => {
      draw();
      frame = v.paused || v.ended ? 0 : requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      loop();
    };
    v.addEventListener("playing", start);
    v.addEventListener("seeked", draw);
    v.addEventListener("loadeddata", draw);
    if (!v.paused) start();
    return () => {
      cancelAnimationFrame(frame);
      v.removeEventListener("playing", start);
      v.removeEventListener("seeked", draw);
      v.removeEventListener("loadeddata", draw);
    };
  }, [video]);
  return (
    <div className="fc-backdrop" aria-hidden>
      {poster && <img src={poster} alt="" />}
      <canvas ref={canvas} width={96} height={54} />
    </div>
  );
}

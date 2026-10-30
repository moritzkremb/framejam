import { useRef, useState, type PointerEvent } from "react";
import { drawPin } from "@/lib/pin";
import { cn } from "@/lib/utils";

/** A stroke is its normalized (0–1) points, flattened: x0, y0, x1, y1, … */
export type Stroke = number[];

export const MAX_STROKES = 40;
const MAX_POINTS = 600;
/** Skip points closer than this to the last one (in frame widths), so strokes stay small. */
const MIN_STEP = 0.004;
const STROKE_COLOR = "#d4ff3a";

const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;

function pathOf(stroke: Stroke): string {
  let d = "";
  for (let i = 0; i < stroke.length; i += 2) d += `${i ? "L" : "M"}${stroke[i]} ${stroke[i + 1]}`;
  return d;
}

/**
 * Strokes over the video frame. With `active`, dragging on the frame draws (mouse, pen or finger) and each finished
 * stroke goes to `onStroke`; otherwise clicks pass through to the frame and the layer only shows strokes.
 */
export function DrawLayer({ strokes, shown = [], active, onStroke }: { strokes: Stroke[]; shown?: Stroke[]; active: boolean; onStroke(stroke: Stroke): void }) {
  const [live, setLive] = useState<Stroke | null>(null);
  const liveRef = useRef<Stroke | null>(null);

  const point = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [round((e.clientX - r.left) / r.width), round((e.clientY - r.top) / r.height)] as const;
  };

  const finish = () => {
    const stroke = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (stroke && stroke.length >= 4) onStroke(stroke);
    else if (stroke) onStroke([...stroke, stroke[0]! + 0.001, stroke[1]!]);
  };

  if (!active && !strokes.length && !shown.length) return null;
  return (
    <svg
      className={cn("fc-draw", active && "active")}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      data-testid="draw-layer"
      onPointerDown={(e) => {
        if (!active || strokes.length >= MAX_STROKES) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const [x, y] = point(e);
        liveRef.current = [x, y];
        setLive([x, y]);
      }}
      onPointerMove={(e) => {
        const stroke = liveRef.current;
        if (!stroke || stroke.length >= MAX_POINTS * 2) return;
        const [x, y] = point(e);
        if (Math.hypot(x - stroke[stroke.length - 2]!, y - stroke[stroke.length - 1]!) < MIN_STEP) return;
        liveRef.current = [...stroke, x, y];
        setLive(liveRef.current);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {shown.map((s, i) => (
        <path key={`s${i}`} d={pathOf(s)} className="shown" />
      ))}
      {strokes.map((s, i) => (
        <path key={i} d={pathOf(s)} />
      ))}
      {live && <path d={pathOf(live)} />}
    </svg>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read the frame"));
    img.src = src;
  });
}

/** The frame image with the pin and the strokes drawn on it, so whoever reads the comment sees what was meant. */
export async function burnFrame(base: string | undefined, { pin, strokes }: { pin?: { x: number; y: number }; strokes: Stroke[] }): Promise<string | undefined> {
  if (!base) return undefined;
  if (!pin && !strokes.length) return base;
  try {
    const img = await loadImage(base);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const g = canvas.getContext("2d")!;
    g.drawImage(img, 0, 0);
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const stroke of strokes) {
      g.beginPath();
      for (let i = 0; i < stroke.length; i += 2) {
        const x = stroke[i]! * canvas.width;
        const y = stroke[i + 1]! * canvas.height;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.lineWidth = Math.max(4, canvas.width / 110);
      g.strokeStyle = "rgba(0, 0, 0, .55)";
      g.stroke();
      g.lineWidth = Math.max(2.5, canvas.width / 180);
      g.strokeStyle = STROKE_COLOR;
      g.stroke();
    }
    if (pin) drawPin(canvas, pin.x, pin.y);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return base;
  }
}

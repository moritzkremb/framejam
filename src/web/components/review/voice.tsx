import { Loader2, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Stroke } from "./drawing";

/** A comment is cut off here: a long ramble costs a lot to transcribe and nobody reads it. */
export const MAX_VOICE_SECONDS = 300;
const SAMPLE_EVERY_MS = 250;
/** While the video plays, a new frame at most this often; paused changes (a click, a stroke) are always kept. */
const PLAYING_EVERY = 1;
const MAX_SAMPLES = 150;
const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** What the reviewer is showing right now. */
export interface VoiceLook {
  time: number;
  x?: number;
  y?: number;
  strokes: Stroke[];
  playing: boolean;
  /** The frame on screen as a JPEG data URL, without the pin or drawing. */
  frame(): string | undefined;
}

/** What was on screen at one moment of the recording. */
export interface VoiceSample {
  /** Seconds into the recording. */
  at: number;
  /** Seconds into the video. */
  time: number;
  x?: number;
  y?: number;
  strokes: Stroke[];
  frame?: string;
}

export interface VoiceTake {
  blob: Blob;
  mime: string;
  duration: number;
  samples: VoiceSample[];
}

export type VoicePhase = "idle" | "recording" | "working";

export function canRecordVoice() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function pickMime() {
  return MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
}

function micError(e: unknown) {
  const name = (e as DOMException | undefined)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "FrameJam can't use your microphone. Allow it in your browser's site settings, then try again.";
  if (name === "NotFoundError") return "No microphone found.";
  return "The microphone couldn't start.";
}

/**
 * Records the reviewer's voice and, every quarter second, what they are showing (video time, pin, drawing, frame),
 * so each word they point with can later be matched to the frame on screen. `onTake` gets the finished recording and
 * may take a while (transcribing): the phase stays "working" until it settles.
 */
export function useVoiceRecorder({ look, onTake, onError }: { look(): VoiceLook | null; onTake(take: VoiceTake): Promise<void>; onError(message: string): void }) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const live = useRef<{ recorder: MediaRecorder; stream: MediaStream; timer: number; sampler: number; cancelled: boolean } | null>(null);
  const latest = useRef({ look, onTake, onError });
  useEffect(() => {
    latest.current = { look, onTake, onError };
  });

  const release = () => {
    const l = live.current;
    if (!l) return;
    window.clearInterval(l.timer);
    window.clearInterval(l.sampler);
    for (const t of l.stream.getTracks()) t.stop();
  };

  const start = useCallback(async () => {
    if (live.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      latest.current.onError(micError(e));
      return;
    }
    let recorder: MediaRecorder;
    try {
      const mimeType = pickMime();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      for (const t of stream.getTracks()) t.stop();
      latest.current.onError("This browser can't record audio.");
      return;
    }

    const chunks: Blob[] = [];
    const samples: VoiceSample[] = [];
    const began = performance.now();
    const elapsed = () => (performance.now() - began) / 1000;
    let signature = "";
    let lastAt = -Infinity;

    const sample = () => {
      const l = latest.current.look();
      if (!l || samples.length >= MAX_SAMPLES) return;
      const sig = `${l.time.toFixed(2)}|${l.x ?? ""}|${l.y ?? ""}|${l.strokes.length}`;
      const at = elapsed();
      if (samples.length && sig === signature) return;
      if (samples.length && l.playing && at - lastAt < PLAYING_EVERY) return;
      signature = sig;
      lastAt = at;
      samples.push({ at, time: l.time, x: l.x, y: l.y, strokes: l.strokes, frame: l.frame() });
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const l = live.current;
      release();
      live.current = null;
      setSeconds(0);
      const duration = elapsed();
      if (!l || l.cancelled || !chunks.length) {
        setPhase("idle");
        return;
      }
      setPhase("working");
      const mime = recorder.mimeType || chunks[0]!.type || "audio/webm";
      latest.current
        .onTake({ blob: new Blob(chunks, { type: mime }), mime, duration, samples })
        .catch((e: unknown) => latest.current.onError((e as Error).message || "The recording couldn't be added."))
        .finally(() => setPhase("idle"));
    };

    sample();
    const sampler = window.setInterval(sample, SAMPLE_EVERY_MS);
    const timer = window.setInterval(() => {
      const s = elapsed();
      setSeconds(s);
      if (s >= MAX_VOICE_SECONDS && recorder.state === "recording") recorder.stop();
    }, 250);
    live.current = { recorder, stream, timer, sampler, cancelled: false };
    recorder.start(1000);
    setPhase("recording");
  }, []);

  const stop = useCallback(() => {
    const l = live.current;
    if (l?.recorder.state === "recording") l.recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    const l = live.current;
    if (!l) return;
    l.cancelled = true;
    if (l.recorder.state === "recording") l.recorder.stop();
  }, []);

  useEffect(
    () => () => {
      const l = live.current;
      if (l) {
        l.cancelled = true;
        if (l.recorder.state === "recording") l.recorder.stop();
        release();
      }
    },
    [],
  );

  return { phase, seconds, start, stop, cancel };
}

/** The microphone button next to the comment box: tap to talk, tap again to stop. */
export function VoiceButton({ phase, seconds, disabled, onStart, onStop }: { phase: VoicePhase; seconds: number; disabled?: boolean; onStart(): void; onStop(): void }) {
  if (phase === "working") {
    return (
      <button type="button" className="fc-btn ghost sm fc-chip-btn" disabled data-testid="voice-working">
        <Loader2 className="fc-i xs fc-spin" /> Transcribing…
      </button>
    );
  }
  const recording = phase === "recording";
  return (
    <button
      type="button"
      className={cn("fc-btn ghost sm fc-chip-btn fc-rec", recording && "on")}
      aria-pressed={recording}
      disabled={disabled && !recording}
      onClick={recording ? onStop : onStart}
      title={recording ? "Stop and add your voice comment" : "Talk through your feedback. Say “this” or “here” while you point."}
      data-testid="voice-toggle"
    >
      {recording ? (
        <>
          <span className="fc-rec-dot" aria-hidden="true" />
          <span className="fc-rec-time">{formatTime(seconds, false)}</span>
          <Square className="fc-i xs fill" />
        </>
      ) : (
        <>
          <Mic className="fc-i xs" /> Voice
        </>
      )}
    </button>
  );
}

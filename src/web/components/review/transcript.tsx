import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { ReviewVersion, Transcript, TranscriptionStatus, TranscriptWord } from "@/lib/api";
import type { ReviewDataSource } from "@/lib/data-source";
import { cn } from "@/lib/utils";

const cache = new Map<string, Transcript>();

/** The version's transcript, or null while loading and for versions without one. */
export function useTranscript(data: ReviewDataSource, reviewId: string, version: ReviewVersion | undefined) {
  const key = version?.transcript ? `${reviewId}:${version.number}:${version.transcript.file}:${version.transcript.words}` : null;
  const [loaded, setLoaded] = useState<{ key: string; transcript: Transcript } | null>(null);
  useEffect(() => {
    if (!key || !version || cache.has(key)) return;
    let cancelled = false;
    data
      .transcript(reviewId, version.number)
      .then((transcript) => {
        cache.set(key, transcript);
        if (!cancelled) setLoaded({ key, transcript });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data, reviewId, version, key]);
  if (!key) return null;
  return cache.get(key) ?? (loaded?.key === key ? loaded.transcript : null);
}

/** Index of the word being spoken at `t` (the last one that started), or -1 before the first. */
export function wordIndexAt(words: TranscriptWord[], t: number) {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

const FILLER = /^(u+m+|u+h+|e+r+m+|h+m+|m+h*m+|a+h+)[,.!?…]*$/i;

/** After the user scrolls the transcript, it stops following playback for this long. */
const HOLD_SCROLL_MS = 4000;

interface PanelProps {
  transcript: Transcript;
  time: number;
  playing: boolean;
  /** Selecting words comments on that range (only while the version is open). */
  canComment: boolean;
  range: { start: number; end: number } | null;
  onSeek(t: number): void;
  onRange(start: number, end: number): void;
}

/** The transcript as paragraphs. Click a word to jump there; select words to comment on them. */
export function TranscriptPanel({ transcript, time, playing, canComment, range, onSeek, onRange }: PanelProps) {
  const { words, paragraphs } = transcript;
  const rootRef = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(0);
  const current = wordIndexAt(words, time);
  const speaking = current >= 0 && time < words[current].end + 0.3 ? current : -1;

  const blocks = useMemo(() => {
    const starts = paragraphs.length ? paragraphs : [0];
    return starts.map((s, i) => ({ from: s, to: starts[i + 1] ?? words.length }));
  }, [paragraphs, words.length]);

  // Thousands of words: they render once, and the spoken one is marked directly instead of re-rendering every frame.
  const rangeStart = range?.start;
  const rangeEnd = range?.end;
  const body = useMemo(
    () =>
      blocks.map((b) => (
        <p key={b.from}>
          {words.slice(b.from, b.to).map((w, k) => (
            <span
              key={k}
              data-i={b.from + k}
              className={cn(FILLER.test(w.text) && "filler", rangeStart !== undefined && rangeEnd !== undefined && w.end > rangeStart && w.start < rangeEnd && "sel")}
            >
              {w.text}{" "}
            </span>
          ))}
        </p>
      )),
    [blocks, words, rangeStart, rangeEnd],
  );

  useEffect(() => {
    const el = speaking >= 0 ? rootRef.current?.querySelector(`[data-i="${speaking}"]`) : null;
    el?.classList.add("on");
    return () => el?.classList.remove("on");
  }, [speaking, body]);

  useEffect(() => {
    if (!playing || current < 0 || Date.now() - userScrolled.current < HOLD_SCROLL_MS) return;
    rootRef.current?.querySelector(`[data-i="${current}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current, playing]);

  const indexOf = (node: Node | null) => {
    const el = node instanceof Element ? node : node?.parentElement;
    const i = el?.closest<HTMLElement>("[data-i]")?.dataset.i;
    return i === undefined ? undefined : Number(i);
  };

  const onMouseUp = (e: MouseEvent) => {
    const sel = window.getSelection();
    const a = sel && !sel.isCollapsed ? indexOf(sel.anchorNode) : undefined;
    const b = sel && !sel.isCollapsed ? indexOf(sel.focusNode) : undefined;
    if (a !== undefined && b !== undefined && canComment) {
      const from = Math.min(a, b);
      const to = Math.max(a, b);
      sel!.removeAllRanges();
      onRange(words[from].start, Math.max(words[to].end, words[from].start + 0.1));
      return;
    }
    const clicked = indexOf(e.target as Node);
    if (clicked !== undefined && (!sel || sel.isCollapsed)) onSeek(words[clicked].start);
  };

  const hold = () => {
    userScrolled.current = Date.now();
  };

  if (!words.length) {
    return (
      <div className="fc-transcript">
        <p className="fc-caption hint">No speech in this version.</p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="fc-transcript" onMouseUp={onMouseUp} onWheel={hold} onTouchMove={hold}>
      <p className="fc-caption hint">{canComment ? "Click a word to jump there. Select words to comment on them." : "Click a word to jump there."}</p>
      {body}
    </div>
  );
}

const started = new Set<string>();

/**
 * Local transcription for a video version without a transcript: starts on its own when whisper.cpp and a model are
 * installed, and reports progress. Null when the version has a transcript, is a storyboard, or the source can't.
 */
export function useTranscription(data: ReviewDataSource, reviewId: string, version: ReviewVersion | undefined) {
  const n = version && !version.transcript && !version.panels?.length && data.transcription ? version.number : undefined;
  const key = n === undefined ? null : `${reviewId}:${n}`;
  const [status, setStatus] = useState<{ key: string; status: TranscriptionStatus } | null>(null);
  // Bumped by the buttons: `start` asks the server to transcribe, otherwise it just looks again.
  const [request, setRequest] = useState({ seq: 0, start: false });

  useEffect(() => {
    if (!key || n === undefined) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async (start: boolean) => {
      try {
        let s = start ? await data.transcribe!(reviewId, n) : await data.transcription!(reviewId, n);
        // Transcribing is free and stays on this computer, so it starts by itself when everything is installed.
        if (s.state === "ready" && !started.has(key)) {
          started.add(key);
          s = await data.transcribe!(reviewId, n);
        }
        if (cancelled) return;
        setStatus({ key, status: s });
        if (s.state === "queued" || s.state === "running") timer = window.setTimeout(() => void poll(false), 1000);
      } catch {
        /* the server went away; the review page shows that */
      }
    };
    void poll(request.start);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [data, reviewId, n, key, request]);

  if (!key) return null;
  return {
    status: status?.key === key ? status.status : null,
    /** Starts transcribing (downloading the model first if needed), or retries after a failure. */
    start: () => setRequest((r) => ({ seq: r.seq + 1, start: true })),
    /** Looks again, e.g. after installing whisper.cpp. */
    recheck: () => setRequest((r) => ({ seq: r.seq + 1, start: false })),
  };
}

const pct = (p: number | undefined) => (p === undefined ? "" : ` ${Math.round(p * 100)}%`);

/** What the Transcript tab shows while there's no transcript yet. */
export function TranscriptionState({ transcription }: { transcription: NonNullable<ReturnType<typeof useTranscription>> }) {
  const { status, start, recheck } = transcription;
  if (!status) return <div className="fc-transcript" />;
  const mac = /Mac/.test(navigator.platform);
  let body: ReactNode;
  switch (status.state) {
    case "ready":
    case "queued":
    case "running": {
      const downloading = status.state !== "ready" && status.downloading !== undefined;
      const progress = status.state === "ready" ? undefined : downloading ? status.downloading : status.progress;
      body = (
        <>
          <p>{downloading ? `Downloading the speech model…${pct(progress)}` : `Transcribing on this computer…${pct(progress)}`}</p>
          <div className="fc-progress">
            <span style={{ width: `${(progress ?? 0) * 100}%` }} />
          </div>
        </>
      );
      break;
    }
    case "no-model":
      body = (
        <>
          <p>Transcribe this video to see what's said and comment on words.</p>
          <p className="hint">
            The first time, FrameJam downloads a speech model ({status.modelSize}) from Hugging Face. Your video stays on this computer.
          </p>
          <button type="button" className="fc-btn sm" onClick={start}>
            Transcribe
          </button>
        </>
      );
      break;
    case "no-tool":
      body = (
        <>
          <p>To see what's said, install {status.ffmpeg ? "whisper.cpp" : "ffmpeg and whisper.cpp"}. FrameJam then transcribes each version on this computer.</p>
          {mac ? (
            <code>brew install {status.ffmpeg ? "" : "ffmpeg "}whisper-cpp</code>
          ) : (
            <a href="https://github.com/ggml-org/whisper.cpp#quick-start" target="_blank" rel="noreferrer">
              How to install whisper.cpp
            </a>
          )}
          <p className="hint">Or ask your agent to attach a transcript.</p>
          <button type="button" className="fc-btn ghost sm" onClick={recheck}>
            Check again
          </button>
        </>
      );
      break;
    case "failed":
      body = (
        <>
          <p>Couldn't transcribe this version{status.error ? `: ${status.error}` : "."}</p>
          <button type="button" className="fc-btn sm" onClick={start}>
            Try again
          </button>
        </>
      );
      break;
    default:
      body = null;
  }
  return <div className="fc-transcript fc-transcribe">{body}</div>;
}

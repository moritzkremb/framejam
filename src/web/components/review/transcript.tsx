import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ReviewVersion, Transcript, TranscriptWord } from "@/lib/api";
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

  return (
    <div ref={rootRef} className="fc-transcript" onMouseUp={onMouseUp} onWheel={hold} onTouchMove={hold}>
      <p className="fc-caption hint">{canComment ? "Click a word to jump there. Select words to comment on them." : "Click a word to jump there."}</p>
      {body}
    </div>
  );
}

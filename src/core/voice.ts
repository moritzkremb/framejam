/**
 * Voice comments: finding the words a reviewer points with ("this", "over here") and matching each to the frame that
 * was on screen when it was said. Pure functions with no browser or Node imports, so the share page, the local app
 * and tests all use the same rules.
 */

/** One spoken word, in seconds from the start of the recording. */
export interface SpokenWord {
  text: string;
  start: number;
  end: number;
}

export interface PointingPhrase {
  /** The words as spoken, without punctuation: "this", "over here", "that one". */
  phrase: string;
  /** When the first word started, in seconds into the recording. */
  at: number;
  end: number;
}

/** Most pointing phrases kept from one recording; every one costs a frame image. */
export const MAX_POINTING_PHRASES = 8;

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

const THINGS = new Set([
  "one",
  "ones",
  "part",
  "bit",
  "bar",
  "text",
  "title",
  "logo",
  "shot",
  "clip",
  "scene",
  "line",
  "thing",
  "area",
  "section",
  "transition",
  "animation",
  "color",
  "colour",
  "font",
  "word",
  "sentence",
  "image",
  "picture",
  "background",
  "icon",
  "button",
  "subtitle",
  "caption",
  "element",
  "frame",
  "spot",
  "corner",
  "side",
  "edge",
]);
/** "over here", "right there": the word before belongs to the phrase. */
const LEADERS = new Set(["over", "right", "down", "up", "in", "out"]);
/** "there is", "there are": not pointing at anything. */
const EXISTENTIAL = new Set(["is", "are", "was", "were", "has", "have", "had", "will", "would", "could", "should", "might", "may", "must", "seems", "appears", "isn't", "aren't", "wasn't", "weren't"]);

/**
 * The pointing phrases in a transcript, in the order they were said. "this" and "these" always point, "that" and
 * "those" only when a thing follows ("that logo"), "here" always, and "there" only after "over" or "right". A leading
 * "over", "right" or "in" and a trailing "one" are part of the phrase ("over here", "this one").
 */
export function findPointingPhrases(words: SpokenWord[], max = MAX_POINTING_PHRASES): PointingPhrase[] {
  const out: PointingPhrase[] = [];
  const n = words.map((w) => norm(w.text));
  let consumed = -1;
  for (let i = 0; i < words.length && out.length < max; i++) {
    if (i <= consumed) continue;
    const w = n[i]!;
    const next = n[i + 1] ?? "";
    const prev = i > 0 && i - 1 > consumed ? (n[i - 1] ?? "") : "";
    let from = i;
    let to = i;
    if (w === "this" || w === "these" || w === "that" || w === "those") {
      if ((w === "that" || w === "those") && !THINGS.has(next)) continue;
      if (next === "one" || next === "ones") to = i + 1;
    } else if (w === "here") {
      if (LEADERS.has(prev)) from = i - 1;
    } else if (w === "there") {
      if (!LEADERS.has(prev) || EXISTENTIAL.has(next)) continue;
      from = i - 1;
    } else {
      continue;
    }
    const phrase = words
      .slice(from, to + 1)
      .map((x) => x.text.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ""))
      .join(" ");
    out.push({ phrase, at: words[from]!.start, end: words[to]!.end });
    consumed = to;
  }
  return out;
}

/**
 * What the reviewer was showing at one moment of the recording: the video time, where they had pinned, and the frame
 * image captured then.
 */
export interface FrameSample {
  /** Seconds into the recording. */
  at: number;
}

/**
 * The sample that was on screen when something was said: the latest one taken by then. A little slack covers someone
 * who clicks as they start the word. Returns the first sample when the word comes before any, so a phrase always has a frame.
 */
export function sampleAt<T extends FrameSample>(samples: T[], at: number, slack = 0.25): T | undefined {
  let found: T | undefined;
  for (const s of samples) {
    if (s.at <= at + slack) found = s;
    else break;
  }
  return found ?? samples[0];
}

export interface TranscriptPiece {
  text: string;
  /** Index into the comment's points when this piece is a pointing phrase. */
  point?: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits a transcript into plain text and pointing phrases, so each phrase can be a link. Phrases are found in the
 * order they were said, each after the one before it; a phrase the text doesn't contain (the service tidied it) is
 * skipped, never guessed.
 */
export function splitTranscript(text: string, points: Array<{ phrase: string }>): TranscriptPiece[] {
  const pieces: TranscriptPiece[] = [];
  let cursor = 0;
  points.forEach((p, index) => {
    const phrase = p.phrase.trim().replace(/\s+/g, " ");
    if (!phrase) return;
    const re = new RegExp(`(?<![\\p{L}\\p{N}'])${escape(phrase).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}'])`, "iu");
    const rest = text.slice(cursor);
    const m = re.exec(rest);
    if (!m) return;
    const start = cursor + m.index;
    if (start > cursor) pieces.push({ text: text.slice(cursor, start) });
    pieces.push({ text: text.slice(start, start + m[0].length), point: index });
    cursor = start + m[0].length;
  });
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) });
  return pieces.length ? pieces : [{ text }];
}

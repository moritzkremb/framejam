/** One spoken word, in seconds from the start of the video. */
export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

/** What the review page shows: every word with its timing, and where paragraphs start (word indexes). */
export interface Transcript {
  words: TranscriptWord[];
  paragraphs: number[];
}

export const TRANSCRIPT_FORMATS = "an .srt or .vtt file, or JSON word timings (Whisper, whisper.cpp, Deepgram, ElevenLabs, or [{ text, start, end }] in seconds)";

class TranscriptError extends Error {}

/**
 * Reads a transcript file's text. `name` (the file name) picks SRT, VTT or JSON; without a known extension the
 * content decides. Cues without word timings are split into words, with times shared out by length.
 */
export function parseTranscript(content: string, name = ""): Transcript {
  const text = content.replace(/^\uFEFF/, "");
  const ext = name.toLowerCase().match(/\.(\w+)$/)?.[1];
  const trimmed = text.trimStart();
  let words: TranscriptWord[];
  if (ext === "json" || (!ext && /^[[{]/.test(trimmed))) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new TranscriptError("The transcript isn't valid JSON");
    }
    words = fromJson(data);
  } else if (ext === "vtt" || trimmed.startsWith("WEBVTT")) {
    words = fromCues(text, true);
  } else if (ext === "srt" || !ext) {
    words = fromCues(text, false);
  } else {
    throw new TranscriptError(`Unsupported transcript file (.${ext}). Use ${TRANSCRIPT_FORMATS}`);
  }
  words = normalize(words);
  if (!words.length) throw new TranscriptError(`No timed words found in the transcript. Use ${TRANSCRIPT_FORMATS}`);
  return { words, paragraphs: paragraphStarts(words) };
}

export function isTranscriptError(err: unknown): err is Error {
  return err instanceof TranscriptError;
}

// --- SRT and VTT ---

const CUE_TIME = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

function clock(s: string): number {
  const parts = s.replace(",", ".").split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function fromCues(text: string, vtt: boolean): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => CUE_TIME.test(l));
    if (at < 0) continue;
    const [, from, to] = lines[at].match(CUE_TIME)!;
    const body = lines.slice(at + 1).join(" ");
    if (vtt && /<\d+:\d{2}/.test(body)) {
      words.push(...inlineTimedWords(body, clock(from), clock(to)));
      continue;
    }
    words.push(...spread(stripTags(body), clock(from), clock(to)));
  }
  return words;
}

function stripTags(s: string) {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/** VTT cues with a timestamp before each word (`<00:00:01.200><c>word</c>`), as YouTube writes them. */
function inlineTimedWords(body: string, start: number, end: number): TranscriptWord[] {
  const pieces: { t: number; text: string }[] = [{ t: start, text: "" }];
  for (const part of body.split(/(<\d+:\d{2}(?::\d{2})?[.,]\d{1,3}>)/)) {
    const stamp = part.match(/^<([\d:.,]+)>$/);
    if (stamp) pieces.push({ t: clock(stamp[1]), text: "" });
    else pieces.at(-1)!.text += stripTags(part);
  }
  const out: TranscriptWord[] = [];
  pieces.forEach((p, i) => {
    const next = pieces[i + 1]?.t ?? end;
    out.push(...spread(p.text, p.t, Math.max(p.t, next)));
  });
  return out;
}

/** Splits a line into words and shares its time span out by word length. */
function spread(text: string, start: number, end: number): TranscriptWord[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const total = parts.reduce((n, w) => n + w.length + 1, 0);
  let t = start;
  return parts.map((w) => {
    const len = ((w.length + 1) / total) * (end - start);
    const word = { text: w, start: t, end: t + len };
    t += len;
    return word;
  });
}

// --- JSON ---

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : undefined);

function timeOf(item: Obj, key: "start" | "end"): number | undefined {
  const sec = num(item[key]) ?? num(item[`${key}Time`]) ?? num(item[`${key}_time`]) ?? num(item[`${key}Seconds`]);
  if (sec !== undefined) return sec;
  const ms = num(item[`${key}Ms`]) ?? num(item[`${key}_ms`]);
  if (ms !== undefined) return ms / 1000;
  // whisper.cpp: offsets in milliseconds.
  const offsets = item.offsets;
  if (isObj(offsets)) {
    const v = num(offsets[key === "start" ? "from" : "to"]);
    if (v !== undefined) return v / 1000;
  }
  return undefined;
}

function textOf(item: Obj): string | undefined {
  for (const k of ["punctuated_word", "text", "word", "token"]) {
    if (typeof item[k] === "string") return item[k] as string;
  }
  return undefined;
}

/** Items that are timed words or timed lines; lines are split into words. */
function fromItems(items: unknown[]): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  for (const item of items) {
    if (!isObj(item)) continue;
    // ElevenLabs marks the gaps between words and sounds like (laughs).
    if (item.type === "spacing" || item.type === "audio_event") continue;
    const nested = Array.isArray(item.words) ? item.words : undefined;
    if (nested?.length) {
      out.push(...fromItems(nested));
      continue;
    }
    const text = textOf(item);
    const start = timeOf(item, "start");
    const end = timeOf(item, "end") ?? start;
    if (text === undefined || start === undefined || end === undefined) continue;
    const parts = text.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) out.push({ text: text.trim(), start, end });
    else out.push(...spread(text, start, end));
  }
  return out;
}

function fromJson(data: unknown): TranscriptWord[] {
  if (Array.isArray(data)) return fromItems(data);
  if (!isObj(data)) return [];
  // Deepgram
  const results = data.results;
  if (isObj(results) && Array.isArray(results.channels)) {
    const alt = (results.channels[0] as Obj | undefined)?.alternatives;
    const words = Array.isArray(alt) ? (alt[0] as Obj | undefined)?.words : undefined;
    if (Array.isArray(words)) return fromItems(words);
  }
  for (const key of ["words", "segments", "transcription", "captions", "cues", "chunks"]) {
    const list = data[key];
    if (Array.isArray(list) && list.length) {
      const words = fromItems(list);
      if (words.length) return words;
    }
  }
  // { transcript: {...} } or { result: {...} } wrappers
  for (const key of ["transcript", "result", "data"]) {
    if (isObj(data[key]) || Array.isArray(data[key])) {
      const words = fromJson(data[key]);
      if (words.length) return words;
    }
  }
  return [];
}

// --- Cleanup and paragraphs ---

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Sound tags transcribers add, like (whoosh), [Music] or ♪, aren't words anyone said. */
const SOUND_TAG = /^(\(.*\)|\[.*\]|[♪♫]+)$/;

function normalize(words: TranscriptWord[]): TranscriptWord[] {
  return words
    .map((w) => ({ text: w.text.replace(/\s+/g, " ").trim(), start: Math.max(0, w.start), end: Math.max(0, w.end) }))
    .filter((w) => w.text && !SOUND_TAG.test(w.text) && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({ text: w.text, start: r3(w.start), end: r3(Math.max(w.start, w.end)) }))
    .sort((a, b) => a.start - b.start);
}

const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

/**
 * Index of the first word of each paragraph. A paragraph ends at a sentence followed by a pause, or once it grows
 * long; transcripts without punctuation break on longer pauses.
 */
export function paragraphStarts(words: TranscriptWord[]): number[] {
  if (!words.length) return [];
  const punctuated = words.some((w) => SENTENCE_END.test(w.text));
  const starts = [0];
  let since = 0;
  for (let i = 1; i < words.length; i++) {
    since++;
    const gap = words[i].start - words[i - 1].end;
    const ended = SENTENCE_END.test(words[i - 1].text);
    const brk = punctuated ? ended && (gap >= 0.8 || since >= 45) : gap >= 1.2 || (since >= 60 && gap >= 0.3);
    if (brk) {
      starts.push(i);
      since = 0;
    }
  }
  return starts;
}

/** The words spoken between two times (any overlap counts), joined as text. */
/** Longer quotes keep their first and last half, so long ranges don't flood the feedback. */
const MAX_QUOTE_WORDS = 30;

export function wordsBetween(t: Transcript | undefined, start: number, end: number): string | undefined {
  if (!t) return undefined;
  const words = t.words.filter((w) => w.end > start && w.start < end).map((w) => w.text);
  if (!words.length) return undefined;
  if (words.length <= MAX_QUOTE_WORDS) return words.join(" ");
  const half = MAX_QUOTE_WORDS / 2;
  return `${words.slice(0, half).join(" ")} … ${words.slice(-half).join(" ")}`;
}

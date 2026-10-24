import { describe, expect, it } from "vitest";
import { paragraphStarts, parseTranscript, wordsBetween } from "../src/core/transcript.ts";

const texts = (content: string, name?: string) => parseTranscript(content, name).words.map((w) => w.text);

describe("parseTranscript", () => {
  it("reads SRT cues and shares each cue's time out over its words", () => {
    const t = parseTranscript("1\n00:00:01,000 --> 00:00:03,000\nOkay, and <i>the</i>\nlast step.\n\n2\n00:00:04,000 --> 00:00:05,000\nDone.\n", "a.srt");
    expect(t.words.map((w) => w.text)).toEqual(["Okay,", "and", "the", "last", "step.", "Done."]);
    expect(t.words[0].start).toBe(1);
    expect(t.words[4].end).toBe(3);
    expect(t.words[5]).toEqual({ text: "Done.", start: 4, end: 5 });
  });

  it("reads VTT, including per-word timestamps", () => {
    expect(texts("WEBVTT\n\nintro\n00:01.000 --> 00:02.000 align:start\nHi there\n", "a.vtt")).toEqual(["Hi", "there"]);
    const t = parseTranscript("WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nhello<00:00:00.800><c> big</c><00:00:01.500><c> world</c>\n");
    expect(t.words.map((w) => [w.text, w.start])).toEqual([
      ["hello", 0],
      ["big", 0.8],
      ["world", 1.5],
    ]);
  });

  it("reads the common JSON shapes", () => {
    const whisper = { segments: [{ start: 0, end: 2, text: " Hi there", words: [{ word: " Hi", start: 0, end: 0.4 }, { word: " there", start: 0.5, end: 1 }] }] };
    expect(texts(JSON.stringify(whisper), "w.json")).toEqual(["Hi", "there"]);
    const segmentsOnly = { segments: [{ start: 0, end: 2, text: "one two" }] };
    expect(parseTranscript(JSON.stringify(segmentsOnly), "s.json").words).toEqual([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 1, end: 2 },
    ]);
    const cpp = { result: { language: "en" }, transcription: [{ offsets: { from: 1000, to: 2000 }, text: " Yes" }, { offsets: { from: 2000, to: 2500 }, text: " (whoosh)" }] };
    expect(parseTranscript(JSON.stringify(cpp), "c.json").words).toEqual([{ text: "Yes", start: 1, end: 2 }]);
    const deepgram = { results: { channels: [{ alternatives: [{ words: [{ word: "so", punctuated_word: "So,", start: 0.1, end: 0.3 }] }] }] } };
    expect(texts(JSON.stringify(deepgram), "d.json")).toEqual(["So,"]);
    const eleven = { words: [{ text: "Hey", start: 0, end: 0.3, type: "word" }, { text: " ", start: 0.3, end: 0.35, type: "spacing" }, { text: "(laughs)", start: 0.4, end: 1, type: "audio_event" }] };
    expect(texts(JSON.stringify(eleven), "e.json")).toEqual(["Hey"]);
    expect(parseTranscript(JSON.stringify([{ text: "Hi", startMs: 1500, endMs: 1800 }])).words).toEqual([{ text: "Hi", start: 1.5, end: 1.8 }]);
  });

  it("explains files it can't use", () => {
    expect(() => parseTranscript("{ nope", "a.json")).toThrow(/valid JSON/);
    expect(() => parseTranscript("{}", "a.json")).toThrow(/No timed words/);
    expect(() => parseTranscript("hello", "a.txt")).toThrow(/Unsupported/);
  });
});

describe("paragraphs and ranges", () => {
  const w = (text: string, start: number, end = start + 0.3) => ({ text, start, end });

  it("starts a paragraph after a sentence and a pause", () => {
    expect(paragraphStarts([w("One.", 0), w("Two.", 0.4), w("Three", 2), w("four", 2.4)])).toEqual([0, 2]);
    expect(paragraphStarts([w("one", 0), w("two", 0.4), w("three", 2.5)])).toEqual([0, 2]);
  });

  it("quotes the words that overlap a span", () => {
    const t = { words: [w("a", 0), w("b", 1), w("c", 2)], paragraphs: [0] };
    expect(wordsBetween(t, 0.9, 2.1)).toBe("b c");
    expect(wordsBetween(t, 5, 6)).toBeUndefined();
    expect(wordsBetween(undefined, 0, 1)).toBeUndefined();
    const long = { words: Array.from({ length: 40 }, (_, i) => ({ text: `w${i}`, start: i, end: i + 0.5 })), paragraphs: [0] };
    const quote = wordsBetween(long, 0, 40)!;
    expect(quote.split(" ").length).toBe(31);
    expect(quote).toMatch(/^w0 .* w14 … w25 .* w39$/);
  });
});

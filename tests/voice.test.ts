import { describe, expect, it } from "vitest";
import { findPointingPhrases, sampleAt, splitTranscript, type SpokenWord } from "../src/core/voice";

/** Words spaced 0.4 s apart from 0.5 s, like the cloud's mock transcriber. */
const say = (text: string): SpokenWord[] => text.split(" ").map((t, i) => ({ text: t, start: 0.5 + i * 0.4, end: 0.8 + i * 0.4 }));
const phrases = (text: string) => findPointingPhrases(say(text)).map((p) => p.phrase);

describe("findPointingPhrases", () => {
  it("finds this, here and over here, with the time of the first word", () => {
    const found = findPointingPhrases(say("Okay so this logo feels too small. And over here the subtitle needs more contrast."));
    expect(found.map((p) => p.phrase)).toEqual(["this", "over here"]);
    expect(found[0]!.at).toBeCloseTo(1.3);
    expect(found[1]!.at).toBeCloseTo(0.5 + 8 * 0.4);
  });

  it("keeps the leader and the trailing one in the phrase", () => {
    expect(phrases("move this one left and put it right here")).toEqual(["this one", "right here"]);
    expect(phrases("these are fine but those ones are not")).toEqual(["these", "those ones"]);
  });

  it("points with that and there only in a pointing way", () => {
    expect(phrases("that logo is off and that is fine")).toEqual(["that"]);
    expect(phrases("there is a gap, but right there it jumps")).toEqual(["right there"]);
    expect(phrases("I think that it works")).toEqual([]);
  });

  it("ignores punctuation and caps and returns nothing for plain feedback", () => {
    expect(phrases("This, honestly, is great.")).toEqual(["This"]);
    expect(phrases("Everything else looks great")).toEqual([]);
  });

  it("stops at the cap", () => {
    expect(findPointingPhrases(say(Array(20).fill("this").join(" ")), 3)).toHaveLength(3);
    expect(findPointingPhrases(say(Array(20).fill("this").join(" ")))).toHaveLength(8);
  });
});

describe("sampleAt", () => {
  const samples = [{ at: 0 }, { at: 2 }, { at: 5 }];
  it("takes the latest sample by that moment, with a little slack", () => {
    expect(sampleAt(samples, 1)).toBe(samples[0]);
    expect(sampleAt(samples, 2)).toBe(samples[1]);
    expect(sampleAt(samples, 1.9)).toBe(samples[1]);
    expect(sampleAt(samples, 9)).toBe(samples[2]);
  });
  it("falls back to the first sample, and to nothing without any", () => {
    expect(sampleAt([{ at: 3 }], 1)).toEqual({ at: 3 });
    expect(sampleAt([], 1)).toBeUndefined();
  });
});

describe("splitTranscript", () => {
  it("splits around each phrase in order", () => {
    expect(splitTranscript("This logo is small and over here is dull", [{ phrase: "This" }, { phrase: "over here" }])).toEqual([
      { text: "This", point: 0 },
      { text: " logo is small and " },
      { text: "over here", point: 1 },
      { text: " is dull" },
    ]);
  });
  it("skips a phrase the text doesn't contain and matches whole words only", () => {
    expect(splitTranscript("Thistle is here", [{ phrase: "this" }, { phrase: "here" }])).toEqual([{ text: "Thistle is " }, { text: "here", point: 1 }]);
    expect(splitTranscript("nothing to point at", [])).toEqual([{ text: "nothing to point at" }]);
  });
  it("copes with odd characters in a phrase", () => {
    expect(splitTranscript("what (this) is", [{ phrase: "(this)" }])).toEqual([{ text: "what " }, { text: "(this)", point: 0 }, { text: " is" }]);
  });
});

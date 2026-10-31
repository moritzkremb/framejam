import { describe, expect, it } from "vitest";
import { parseProjectRef } from "../src/core/feedback.ts";

describe("parseProjectRef", () => {
  it("takes a plain project id as it is", () => {
    expect(parseProjectRef("k57abc")).toEqual({ reviewId: "k57abc" });
    expect(parseProjectRef("  rev_ab12  ")).toEqual({ reviewId: "rev_ab12" });
  });

  it("reads the project and the version out of a project link", () => {
    expect(parseProjectRef("https://app.framejam.ai/p/k57abc")).toEqual({ reviewId: "k57abc" });
    expect(parseProjectRef("https://app.framejam.ai/p/k57abc?v=3")).toEqual({ reviewId: "k57abc", version: 3 });
    expect(parseProjectRef("http://localhost:2400/review/rev_x1?foo=1&v=2#c")).toEqual({ reviewId: "rev_x1", version: 2 });
  });
});

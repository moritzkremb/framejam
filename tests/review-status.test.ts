import { describe, expect, it } from "vitest";
import { reviewStatus, type ReviewTurnInput } from "../src/shared/review-status.ts";

const base: ReviewTurnInput = { latestVersion: 1, latestSent: false, delivered: false, draftComments: 0, agentListening: false };

describe("dashboard review status", () => {
  it("a first version with no comments is waiting for your feedback, blue while the agent listens", () => {
    expect(reviewStatus(base)).toMatchObject({ kind: "waiting_for_you", tone: "you", needsYou: true });
    expect(reviewStatus({ ...base, agentListening: true })).toMatchObject({ kind: "waiting_for_you", tone: "agent" });
  });

  it("a later version the user hasn't commented on is a new version ready", () => {
    expect(reviewStatus({ ...base, latestVersion: 3 })).toMatchObject({ kind: "new_version", text: "New version ready · v3", needsYou: true });
  });

  it("unsent comments win over a new version", () => {
    expect(reviewStatus({ ...base, latestVersion: 2, draftComments: 1 }).text).toBe("1 comment not sent");
    expect(reviewStatus({ ...base, draftComments: 3 }).text).toBe("3 comments not sent");
  });

  it("a sent round is with the agent once delivered, and asks you to tell it before that", () => {
    expect(reviewStatus({ ...base, latestSent: true })).toMatchObject({ kind: "tell_agent", needsYou: true });
    expect(reviewStatus({ ...base, latestVersion: 2, latestSent: true, delivered: true })).toMatchObject({
      kind: "with_agent",
      text: "With your agent · making v3",
      working: true,
      needsYou: false,
    });
  });
});

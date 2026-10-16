/** The fields of a review list item that decide whose turn it is. */
export interface ReviewTurnInput {
  latestVersion: number;
  latestSent: boolean;
  delivered: boolean;
  draftComments: number;
  agentListening: boolean;
}

export type ReviewStatusKind = "with_agent" | "tell_agent" | "not_sent" | "new_version" | "waiting_for_you";

export interface ReviewStatus {
  kind: ReviewStatusKind;
  text: string;
  /** `you`: lime, your move. `agent`: blue, the agent is on it or waiting on you. */
  tone: "you" | "agent";
  /** The agent has the comments and is making the next version. */
  working?: boolean;
  needsYou: boolean;
}

/** Whose turn it is on a review, in the dashboard's words. */
export function reviewStatus(r: ReviewTurnInput): ReviewStatus {
  if (r.latestSent && r.delivered) {
    return { kind: "with_agent", text: `With your agent · making v${r.latestVersion + 1}`, tone: "agent", working: true, needsYou: false };
  }
  if (r.latestSent) {
    return { kind: "tell_agent", text: "Sent · tell your agent to pick it up", tone: "you", needsYou: true };
  }
  if (r.draftComments) {
    const n = r.draftComments;
    return { kind: "not_sent", text: `${n} comment${n === 1 ? "" : "s"} not sent`, tone: "you", needsYou: true };
  }
  if (r.latestVersion > 1) {
    return { kind: "new_version", text: `New version ready · v${r.latestVersion}`, tone: "you", needsYou: true };
  }
  return { kind: "waiting_for_you", text: "Waiting for your feedback", tone: r.agentListening ? "agent" : "you", needsYou: true };
}

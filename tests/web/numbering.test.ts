import { describe, expect, it } from "vitest";
import { byTime, numberComments } from "@/components/review/numbering";
import type { ReviewComment } from "@/lib/api";

const c = (id: string, time: number, over: Partial<ReviewComment> = {}): ReviewComment =>
  ({ id, version: 1, time, text: id, status: "draft", createdAt: `2026-10-01T00:00:0${time}Z`, ...over }) as ReviewComment;

describe("comment numbers", () => {
  it("give the link's comments the same numbers for the owner and the guest, before anyone's private ones", () => {
    const anna = c("anna", 3, { author: "Anna", status: "sent" });
    const ben = c("ben", 5, { author: "Ben", status: "sent" });
    const owner = numberComments([c("mine", 1), { ...anna, status: "draft" }, { ...ben, status: "draft" }], "owner", byTime);
    expect(owner.ordered.map((x) => x.id)).toEqual(["anna", "ben", "mine"]);

    const guest = numberComments([c("draft", 0, { author: "Cleo" }), ben, anna], "guest", byTime);
    expect(guest.ordered.map((x) => x.id)).toEqual(["anna", "ben", "draft"]);
    expect(guest.number.get("anna")).toBe(owner.number.get("anna"));
    expect(guest.number.get("ben")).toBe(owner.number.get("ben"));
  });

  it("orders by time on the local app, where nothing is shared", () => {
    const { ordered } = numberComments([c("b", 4), c("a", 2)], "local", byTime);
    expect(ordered.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

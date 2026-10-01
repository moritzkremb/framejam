import fs from "node:fs";
import path from "node:path";
import type { ElementInfo, Review, ReviewComment } from "../shared/types.ts";
import type { Store } from "./store.ts";

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, "0")}`;
}

export function reviewUrl(baseUrl: string, reviewId: string) {
  return `${baseUrl}/review/${reviewId}`;
}

export interface AgentComment {
  id: string;
  version: number;
  status: ReviewComment["status"];
  at: string;
  time: number;
  endTime?: number;
  kind: ReviewComment["kind"];
  wholeVideo?: boolean;
  position?: { x: number; y: number; description: string };
  text: string;
  element?: ElementInfo;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  resolution?: ReviewComment["resolution"];
}

export function toAgentComment(store: Store, baseUrl: string, review: Review, c: ReviewComment): AgentComment {
  const thumbPath = c.thumbnail ? path.join(store.thumbsDir(review.id), c.thumbnail) : undefined;
  return {
    id: c.id,
    version: c.version,
    status: c.status,
    at: c.wholeVideo ? "whole video" : c.endTime !== undefined ? `${formatTime(c.time)}–${formatTime(c.endTime)}` : formatTime(c.time),
    time: c.time,
    endTime: c.endTime,
    kind: c.kind,
    wholeVideo: c.wholeVideo,
    position:
      c.x !== undefined && c.y !== undefined
        ? { x: c.x, y: c.y, description: describePosition(c.x, c.y) }
        : undefined,
    text: c.text,
    element: c.element,
    thumbnailPath: thumbPath && fs.existsSync(thumbPath) ? thumbPath : undefined,
    thumbnailUrl: c.thumbnail ? `${baseUrl}/api/reviews/${review.id}/thumbs/${c.thumbnail}` : undefined,
    resolution: c.resolution,
  };
}

export function describePosition(x: number, y: number): string {
  const col = x < 0.33 ? "left" : x > 0.66 ? "right" : "center";
  const row = y < 0.33 ? "top" : y > 0.66 ? "bottom" : "middle";
  const where = row === "middle" && col === "center" ? "center" : `${row} ${col}`;
  return `${where} of frame (${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top)`;
}

function describeElement(el: ElementInfo): string[] {
  const lines = [`  - Element: \`${el.selector}\`${el.text ? ` — "${truncate(el.text, 80)}"` : ""}`];
  if (el.clip) {
    lines.push(
      `  - Clip: \`${el.clip.selector}\`${el.clip.start !== undefined ? ` (data-start ${el.clip.start}${el.clip.duration ? `, duration ${el.clip.duration}` : ""})` : ""}`,
    );
  }
  for (const t of el.tweens.slice(0, 3)) {
    const props = Object.entries(t.props)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    lines.push(
      `  - ${t.relation === "active" ? "Active" : t.relation === "previous" ? "Previous" : "Next"} tween: ${t.targets.join(", ")} { ${props} } ${t.start.toFixed(2)}s→${t.end.toFixed(2)}s${t.ease ? ` ease ${t.ease}` : ""}`,
    );
  }
  return lines;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Markdown used by the "Copy as prompt" button and returned to agents alongside JSON. */
export function feedbackPrompt(
  store: Store,
  baseUrl: string,
  review: Review,
  comments: ReviewComment[],
  opts: { message?: string } = {},
): string {
  const latest = review.versions.at(-1)!;
  const lines: string[] = [];
  lines.push(`# Video feedback: ${review.title} (v${latest.number})`);
  lines.push("");
  if (latest.compositionDir) lines.push(`Composition: \`${path.join(latest.compositionDir, latest.compositionEntry ?? "index.html")}\``);
  if (latest.videoPath) lines.push(`Render: \`${latest.videoPath}\``);
  lines.push(`Review: ${reviewUrl(baseUrl, review.id)}`);
  lines.push("");
  if (opts.message) {
    lines.push(`> ${opts.message.replace(/\n/g, "\n> ")}`, "");
  }
  if (!comments.length) {
    lines.push("_No comments._");
    return lines.join("\n");
  }
  lines.push(`Please make these ${comments.length} change${comments.length === 1 ? "" : "s"}:`, "");
  const sorted = [...comments].sort((a, b) => Number(!!b.wholeVideo) - Number(!!a.wholeVideo) || a.time - b.time);
  sorted.forEach((c, i) => {
    const a = toAgentComment(store, baseUrl, review, c);
    const ver = c.version !== latest.number ? ` (on v${c.version})` : "";
    lines.push(`${i + 1}. **[${a.at}]**${ver} ${c.text}`);
    if (a.position) lines.push(`  - Pinned at ${a.position.description}`);
    if (c.element) lines.push(...describeElement(c.element));
    if (a.thumbnailPath) lines.push(`  - Frame: ${a.thumbnailUrl} (file: \`${a.thumbnailPath}\`)`);
    lines.push(`  - Comment id: \`${c.id}\``);
  });
  lines.push("");
  lines.push(
    "When done, re-render and call `add_version` (or `open_review` again) with the new render and a one-line `note` of what you changed. The new version starts with an empty comment list. Then call `wait_for_feedback` again.",
  );
  return lines.join("\n");
}

export function versionComments(review: Review, version: number): ReviewComment[] {
  return review.comments.filter((c) => c.version === version);
}

/** Comments of the newest version that has any (the open version's drafts, or the last sent round). */
export function latestComments(review: Review): ReviewComment[] {
  for (const v of [...review.versions].reverse()) {
    const list = versionComments(review, v.number);
    if (list.length) return list;
  }
  return [];
}

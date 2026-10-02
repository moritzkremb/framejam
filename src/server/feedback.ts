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
  /** Storyboards: the panel the comment is on, with the image as it was when the user commented. */
  panel?: { number: number; title?: string; caption?: string; imagePath?: string };
  text: string;
  element?: ElementInfo;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  resolution?: ReviewComment["resolution"];
}

export function isStoryboard(review: Review, versionNumber?: number) {
  const v = versionNumber ? review.versions.find((x) => x.number === versionNumber) : review.versions.at(-1);
  return Boolean(v?.panels?.length);
}

function commentAt(review: Review, c: ReviewComment) {
  if (c.wholeVideo) return isStoryboard(review, c.version) ? "whole storyboard" : "whole video";
  if (c.panel !== undefined) {
    const title = review.versions.find((v) => v.number === c.version)?.panels?.[c.panel - 1]?.title;
    return `panel ${c.panel}${title ? ` (${title})` : ""}`;
  }
  return c.endTime !== undefined ? `${formatTime(c.time)}–${formatTime(c.endTime)}` : formatTime(c.time);
}

export function toAgentComment(store: Store, baseUrl: string, review: Review, c: ReviewComment): AgentComment {
  const thumbPath = c.thumbnail ? path.join(store.thumbsDir(review.id), c.thumbnail) : undefined;
  const version = review.versions.find((v) => v.number === c.version);
  const panel = c.panel !== undefined && version ? version.panels?.[c.panel - 1] : undefined;
  return {
    id: c.id,
    version: c.version,
    status: c.status,
    at: commentAt(review, c),
    time: c.time,
    endTime: c.endTime,
    kind: c.kind,
    wholeVideo: c.wholeVideo,
    position:
      c.x !== undefined && c.y !== undefined
        ? { x: c.x, y: c.y, description: describePosition(c.x, c.y, panel ? "panel" : "frame") }
        : undefined,
    panel:
      panel && version
        ? { number: c.panel!, title: panel.title, caption: panel.caption, imagePath: store.panelFileFor(review.id, version, c.panel!) }
        : undefined,
    text: c.text,
    element: c.element,
    thumbnailPath: thumbPath && fs.existsSync(thumbPath) ? thumbPath : undefined,
    thumbnailUrl: c.thumbnail ? `${baseUrl}/api/reviews/${review.id}/thumbs/${c.thumbnail}` : undefined,
    resolution: c.resolution,
  };
}

export function describePosition(x: number, y: number, of = "frame"): string {
  const col = x < 0.33 ? "left" : x > 0.66 ? "right" : "center";
  const row = y < 0.33 ? "top" : y > 0.66 ? "bottom" : "middle";
  const where = row === "middle" && col === "center" ? "center" : `${row} ${col}`;
  return `${where} of ${of} (${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top)`;
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
  const storyboard = Boolean(latest.panels?.length);
  const lines: string[] = [];
  lines.push(`# ${storyboard ? "Storyboard" : "Video"} feedback: ${review.title} (v${latest.number})`);
  lines.push("");
  if (storyboard) {
    lines.push(`Storyboard: ${latest.panels!.length} panels${latest.panelsDir ? ` from \`${latest.panelsDir}\`` : ""}`);
    latest.panels!.forEach((p, i) => lines.push(`  ${i + 1}. \`${p.sourcePath}\`${p.title ? ` — ${p.title}` : ""}`));
  }
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
  const sorted = [...comments].sort(
    (a, b) => Number(!!b.wholeVideo) - Number(!!a.wholeVideo) || (a.panel ?? 0) - (b.panel ?? 0) || a.time - b.time,
  );
  sorted.forEach((c, i) => {
    const a = toAgentComment(store, baseUrl, review, c);
    const ver = c.version !== latest.number ? ` (on v${c.version})` : "";
    lines.push(`${i + 1}. **[${a.at}]**${ver} ${c.text}`);
    if (a.position) lines.push(`  - Pinned at ${a.position.description}`);
    if (a.panel?.caption) lines.push(`  - Panel caption: ${a.panel.caption}`);
    if (c.element) lines.push(...describeElement(c.element));
    if (a.thumbnailPath) lines.push(`  - ${a.panel ? (a.position ? "Panel with pin" : "Panel") : "Frame"}: ${a.thumbnailUrl} (file: \`${a.thumbnailPath}\`)`);
    lines.push(`  - Comment id: \`${c.id}\``);
  });
  lines.push("");
  lines.push(
    storyboard
      ? "When done, update the panel images and call `add_version` with the new panels (or the same `panelsDir`) and a one-line `note` of what you changed. The new version starts with an empty comment list. Then call `wait_for_feedback` again."
      : "When done, re-render and call `add_version` (or `open_review` again) with the new render and a one-line `note` of what you changed. The new version starts with an empty comment list. Then call `wait_for_feedback` again.",
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

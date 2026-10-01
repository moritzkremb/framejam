import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Review, ReviewComment } from "../shared/types.ts";
import { feedbackPrompt, latestComments, reviewUrl, toAgentComment, versionComments } from "./feedback.ts";
import type { PresetLibrary } from "./presets.ts";
import type { Store } from "./store.ts";

export interface McpContext {
  store: Store;
  presets: PresetLibrary;
  baseUrl: string;
  /** Upper bound for one wait_for_feedback call before it returns `pending`. */
  waitSeconds?: number;
  pollMs?: number;
  progressEveryMs?: number;
}

const MAX_IMAGES = 6;

const SERVER_INSTRUCTIONS = `Frame Jam lets the user review Hyperframes videos and pick style presets.
Loop: (optional) get_selected_preset / list_presets -> build the composition -> render -> open_review -> share the URL -> wait_for_feedback (call again while it returns status "pending") -> edit -> re-render -> add_version with a note -> wait_for_feedback again.
Each version is one round: the user comments on it and presses Send, which locks it. The next version starts with no comments.
If the user says "apply my Frame Jam feedback" (with or without a review id), call get_feedback.`;

function json(data: unknown): CallToolResult["content"][number] {
  return { type: "text", text: JSON.stringify(data, null, 2) };
}

function errorResult(err: unknown): CallToolResult {
  return { isError: true, content: [{ type: "text", text: (err as Error).message ?? String(err) }] };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

export function createMcpServer(ctx: McpContext): McpServer {
  const { store, presets } = ctx;
  const server = new McpServer(
    { name: "framejam", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS, capabilities: { logging: {} } },
  );
  server.server.oninitialized = () => {
    const client = server.server.getClientVersion();
    store.recordAgent(client?.name, client?.version);
  };

  const feedbackContent = (review: Review, comments: ReviewComment[], extra: Record<string, unknown>, message?: string) => {
    const agentComments = comments.map((c) => toAgentComment(store, ctx.baseUrl, review, c));
    const latest = review.versions.at(-1)!;
    const content: CallToolResult["content"] = [
      json({
        ...extra,
        reviewId: review.id,
        title: review.title,
        url: reviewUrl(ctx.baseUrl, review.id),
        currentVersion: latest.number,
        compositionDir: latest.compositionDir,
        videoPath: latest.videoPath,
        message,
        comments: agentComments,
      }),
      { type: "text", text: feedbackPrompt(store, ctx.baseUrl, review, comments, { message }) },
    ];
    for (const c of agentComments.filter((c) => c.thumbnailPath).slice(0, MAX_IMAGES)) {
      content.push({ type: "text", text: `Frame for comment ${c.id} at ${c.at}:` });
      content.push({ type: "image", mimeType: "image/jpeg", data: fs.readFileSync(c.thumbnailPath!).toString("base64") });
    }
    return content;
  };

  server.registerTool(
    "open_review",
    {
      title: "Open a video review",
      description:
        "Open a review page for a rendered video and/or a live Hyperframes composition. Returns { reviewId, url, version }. " +
        "Calling it again for the same compositionDir (or title) adds a new version to the existing review; each version starts with no comments. " +
        "Use absolute paths. Show the URL to the user, then call wait_for_feedback.",
      inputSchema: {
        title: z.string().optional().describe("Human-readable title, e.g. 'Launch video'"),
        videoPath: z.string().optional().describe("Absolute path to the rendered mp4/webm"),
        compositionDir: z
          .string()
          .optional()
          .describe("Absolute path to the Hyperframes project folder (containing index.html), or to the composition HTML file"),
        reviewId: z.string().optional().describe("Force adding a version to this existing review"),
        note: z.string().optional().describe("What changed in this version"),
      },
    },
    async (args) => {
      try {
        const { review, version, created } = store.openReview(args);
        return {
          content: [
            json({
              reviewId: review.id,
              url: reviewUrl(ctx.baseUrl, review.id),
              version: version.number,
              created,
              next: "Share the url with the user (open it in the harness browser if you can), then call wait_for_feedback with this reviewId.",
            }),
          ],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "wait_for_feedback",
    {
      title: "Wait for the user to send feedback",
      description:
        "Blocks until the user presses 'Send to agent' in the review UI, then returns the submitted comments (timestamp, pin position, " +
        "DOM element / GSAP tween when available, and frame thumbnails). Returns { status: 'pending' } after ~50s so clients don't time out: " +
        "when that happens, call wait_for_feedback again immediately with the same reviewId.",
      inputSchema: {
        reviewId: z.string(),
        timeoutSeconds: z.number().min(1).max(300).optional().describe("Max seconds to block before returning pending (default 50)"),
      },
    },
    async ({ reviewId, timeoutSeconds }, extra) => {
      try {
        store.getReview(reviewId);
      } catch (err) {
        return errorResult(err);
      }
      const timeoutMs = (timeoutSeconds ?? ctx.waitSeconds ?? 50) * 1000;
      const pollMs = ctx.pollMs ?? 400;
      const progressEvery = ctx.progressEveryMs ?? 10_000;
      const progressToken = extra._meta?.progressToken;
      const started = Date.now();
      let lastProgress = started;
      store.setAgentWaiting(reviewId, true);
      try {
        while (!extra.signal.aborted) {
          const batches = store.undeliveredBatches(reviewId);
          if (batches.length) {
            store.markDelivered(reviewId, batches.map((b) => b.id));
            const review = store.getReview(reviewId);
            const ids = new Set(batches.flatMap((b) => b.commentIds));
            const comments = review.comments.filter((c) => ids.has(c.id));
            const message = batches.map((b) => b.message).filter(Boolean).join("\n\n") || undefined;
            return {
              content: feedbackContent(
                review,
                comments,
                {
                  status: "feedback",
                  next: "Apply every comment to the composition, re-render, call add_version with the new render, resolve_comments with the ids you fixed, then wait_for_feedback again.",
                },
                message,
              ),
            };
          }
          const elapsed = Date.now() - started;
          if (elapsed >= timeoutMs) break;
          if (progressToken !== undefined && Date.now() - lastProgress >= progressEvery) {
            lastProgress = Date.now();
            await extra
              .sendNotification({
                method: "notifications/progress",
                params: { progressToken, progress: Math.round(elapsed / 1000), message: "Waiting for the user to press Send to agent" },
              })
              .catch(() => {});
          }
          await sleep(Math.min(pollMs, timeoutMs - elapsed), extra.signal);
        }
      } finally {
        store.setAgentWaiting(reviewId, false);
      }
      return {
        content: [
          json({
            status: "pending",
            reviewId,
            url: reviewUrl(ctx.baseUrl, reviewId),
            next: "No feedback yet. Call wait_for_feedback again with the same reviewId (do not ask the user first).",
          }),
        ],
      };
    },
  );

  /** The review the user most likely means by "apply my feedback": unsent-to-agent first, then unsent drafts, then most recent. */
  const pickReview = (): Review | undefined => {
    const all = store.listReviews();
    return (
      all.find((r) => r.batches.some((b) => !b.deliveredAt)) ??
      all.find((r) => {
        const latest = r.versions.at(-1);
        return latest && !latest.sentAt && r.comments.some((c) => c.version === latest.number && c.status === "draft");
      }) ??
      all[0]
    );
  };

  server.registerTool(
    "get_feedback",
    {
      title: "Get review feedback",
      description:
        "Return the user's comments without waiting. Use when the user says 'apply my Frame Jam feedback'. reviewId is optional: without it, " +
        "the review whose feedback hasn't reached you yet is used. If the user wrote comments but never pressed Send, they are sent now " +
        "(this locks that version, as Send would). include='all' returns every version's comments.",
      inputSchema: {
        reviewId: z.string().optional(),
        include: z.enum(["latest", "all"]).optional().describe("latest (default): the newest round of comments; all: every version"),
      },
    },
    async ({ reviewId, include }) => {
      try {
        let review = reviewId ? store.getReview(reviewId) : pickReview();
        if (!review) {
          return { content: [json({ status: "empty", next: "No reviews yet. Build a video and call open_review." })] };
        }
        const versions = review.versions.map((v) => ({ number: v.number, note: v.note, sent: Boolean(v.sentAt) }));
        if (include === "all") {
          return { content: feedbackContent(review, review.comments, { status: review.comments.length ? "feedback" : "empty", versions }) };
        }
        let batches = review.batches.filter((b) => !b.deliveredAt);
        const latest = review.versions.at(-1)!;
        if (!batches.length && !latest.sentAt && versionComments(review, latest.number).some((c) => c.status === "draft")) {
          store.submit(review.id);
          review = store.getReview(review.id);
          batches = review.batches.filter((b) => !b.deliveredAt);
        }
        if (batches.length) {
          store.markDelivered(review.id, batches.map((b) => b.id));
          const ids = new Set(batches.flatMap((b) => b.commentIds));
          const message = batches.map((b) => b.message).filter(Boolean).join("\n\n") || undefined;
          return {
            content: feedbackContent(
              review,
              review.comments.filter((c) => ids.has(c.id)),
              {
                status: "feedback",
                versions,
                next: "Apply every comment, re-render, call add_version with the new render and a note, then wait_for_feedback.",
              },
              message,
            ),
          };
        }
        const last = latestComments(review);
        return {
          content: feedbackContent(review, last, {
            status: last.length ? "already_delivered" : "empty",
            versions,
            next: last.length
              ? "These comments were delivered before. If you already shipped a version for them, call wait_for_feedback for the next round."
              : "The user hasn't commented yet. Call wait_for_feedback.",
          }),
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_reviews",
    {
      title: "List reviews",
      description: "List the user's video reviews, newest first, with their review page URL and where each round stands.",
      inputSchema: {},
    },
    async () => {
      const list = store.listReviews().map((r) => {
        const latest = r.versions.at(-1)!;
        const batch = latest.batchId ? r.batches.find((b) => b.id === latest.batchId) : undefined;
        const drafts = r.comments.filter((c) => c.version === latest.number && c.status === "draft").length;
        return {
          reviewId: r.id,
          title: r.title,
          url: reviewUrl(ctx.baseUrl, r.id),
          updatedAt: r.updatedAt,
          latestVersion: latest.number,
          state: !latest.sentAt
            ? drafts
              ? "user_commenting"
              : "awaiting_user"
            : batch?.deliveredAt
              ? "delivered_to_agent"
              : "sent_not_delivered",
        };
      });
      return { content: [json({ count: list.length, reviews: list })] };
    },
  );

  server.registerTool(
    "resolve_comments",
    {
      title: "Resolve review comments",
      description: "Optional bookkeeping: mark comments you addressed (ids from the feedback, or ['all'] for every sent comment). The user sees each version's comments as one round, so add_version with a note is what they read.",
      inputSchema: {
        reviewId: z.string(),
        ids: z.array(z.string()).min(1),
        note: z.string().optional().describe("Short description of what you changed"),
      },
    },
    async ({ reviewId, ids, note }) => {
      try {
        const result = store.resolveComments(reviewId, ids, note);
        const review = store.getReview(reviewId);
        return { content: [json({ ...result, stillOpen: review.comments.filter((c) => c.status === "sent").length })] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "add_version",
    {
      title: "Add a new version to a review",
      description:
        "Attach a new render (and/or composition) to an existing review as v2, v3, ... The new version starts with an empty comment list. Pass a one-line note of what you changed; the user sees it when the version arrives. Prefer a new file name per render so earlier versions stay comparable.",
      inputSchema: {
        reviewId: z.string(),
        videoPath: z.string().optional(),
        compositionDir: z.string().optional().describe("Defaults to the previous version's composition"),
        note: z.string().optional().describe("What changed"),
      },
    },
    async ({ reviewId, videoPath, compositionDir, note }) => {
      try {
        const prev = store.getReview(reviewId).versions.at(-1);
        const review = store.addVersion(reviewId, {
          videoPath,
          compositionDir: compositionDir ?? (videoPath ? undefined : prev?.compositionDir),
          note,
        });
        const v = review.versions.at(-1)!;
        return {
          content: [json({ reviewId, version: v.number, url: reviewUrl(ctx.baseUrl, reviewId), next: "Tell the user the new version is ready, then call wait_for_feedback." })],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_presets",
    {
      title: "List style presets",
      description: "List the video style presets in the library. Filter by mood, pacing (slow|medium|fast), format (16:9|9:16|1:1), or free-text query.",
      inputSchema: {
        mood: z.string().optional(),
        pacing: z.enum(["slow", "medium", "fast"]).optional(),
        format: z.enum(["16:9", "9:16", "1:1"]).optional(),
        query: z.string().optional(),
      },
    },
    async (filter) => {
      const selected = store.getState().selectedPreset?.id;
      const list = presets.list(filter).map(({ style }) => ({
        id: style.id,
        name: style.name,
        tagline: style.tagline,
        mood: style.mood,
        pacing: style.pacing,
        format: style.format,
        durationSeconds: style.durationSeconds,
        selected: style.id === selected,
        galleryUrl: `${ctx.baseUrl}/styles/${style.id}`,
      }));
      return { content: [json({ count: list.length, presets: list })] };
    },
  );

  const presetPayload = (id: string) => {
    const p = presets.get(id);
    if (!p) return undefined;
    return {
      style: p.style,
      guide: p.style.guide,
      presetDir: p.dir,
      compositionDir: path.join(p.dir, "composition"),
      previewVideo: fs.existsSync(path.join(p.dir, "preview.mp4")) ? path.join(p.dir, "preview.mp4") : undefined,
      galleryUrl: `${ctx.baseUrl}/styles/${id}`,
      templateFiles: presets.templateSource(p),
    };
  };

  server.registerTool(
    "get_preset",
    {
      title: "Get a style preset",
      description: "Return a preset's style.json (palette, fonts, easing, transitions, text animations, pacing), its agent-facing style guide, and the Hyperframes template source.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const payload = presetPayload(id);
      if (!payload) return errorResult(new Error(`Unknown preset: ${id}. Call list_presets to see ids.`));
      return { content: [json(payload)] };
    },
  );

  server.registerTool(
    "get_selected_preset",
    {
      title: "Get the preset the user picked",
      description: "Return the preset the user marked with 'Use this style' in the gallery (style.json, guide, template source), or null if none is selected.",
      inputSchema: {},
    },
    async () => {
      const sel = store.getState().selectedPreset;
      const payload = sel ? presetPayload(sel.id) : undefined;
      if (!sel || !payload) {
        return {
          content: [
            json({
              selected: null,
              galleryUrl: `${ctx.baseUrl}/styles`,
              next: "No preset selected. Ask the user to pick one in the gallery, or choose one yourself with list_presets.",
            }),
          ],
        };
      }
      return { content: [json({ selected: sel.id, selectedAt: sel.selectedAt, ...payload })] };
    },
  );

  return server;
}

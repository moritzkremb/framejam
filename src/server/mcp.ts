import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { FeedbackBatch, Review, ReviewComment } from "../shared/types.ts";
import { feedbackPrompt, latestComments, reviewUrl, toAgentComment, versionComments } from "./feedback.ts";
import { costBadge, projectLabel, stylesSentence } from "../shared/playbooks.ts";
import type { PlaybookLibrary } from "./playbooks.ts";
import { currentSkillVersion } from "./skill.ts";
import { UPDATE_COMMAND } from "./update.ts";
import type { PresetLibrary } from "./presets.ts";
import type { ChooseSavePath } from "./save-dialog.ts";
import { LISTEN_HEARTBEAT_MS, type Store } from "./store.ts";

export interface McpContext {
  store: Store;
  presets: PresetLibrary;
  playbooks: PlaybookLibrary;
  baseUrl: string;
  /** Upper bound for one wait_for_feedback call before it returns `pending`. */
  waitSeconds?: number;
  /** Replaces the npm registry lookup behind the UI's "new version" notice (tests). */
  fetchLatestVersion?: () => Promise<string | null>;
  /** Where the save dialog for "Download video" starts, and where it saves without one. Defaults to Downloads (tests). */
  downloadsDir?: string;
  /** Replaces the system save dialog behind "Download video" (tests). */
  chooseSavePath?: ChooseSavePath;
  pollMs?: number;
  progressEveryMs?: number;
  /** Folders checked for installed copies of the skill. Defaults to the global skill folders (tests). */
  skillDirs?: string[];
}

const MAX_IMAGES = 6;

const skillLine = () => {
  const v = currentSkillVersion();
  return v === null
    ? ""
    : `\nThe current FrameJam skill is version ${v}. If the FrameJam skill you loaded says a lower "Skill version", or has no version line, tell the user once: "Your FrameJam skill is out of date. Run \`${UPDATE_COMMAND}\` and restart your agent."`;
};

const serverInstructions = (baseUrl: string) => `FrameJam lets the user review videos made with any tool (Hyperframes, Remotion, Motion Canvas, ffmpeg, screen recordings...) and storyboards (a sequence of still panels), pick style presets, and pick playbooks (a method for one kind of video, e.g. a music video or a talking-head short).
First, open the FrameJam UI (${baseUrl}, or the review url) in the harness's built-in browser if you have a browser tool. If it doesn't load, run \`npx -y framejam start\`.
Before building, call get_selected_playbook and get_selected_preset. If a playbook is selected (or the user names one), follow its SKILL.md; the style, if any, combines with it as the playbook's stylesSentence says.
A style is a look, not a starting video: plan the video from the user's request, then build that subject in the style's palette, textures, type, motion and pacing. Don't copy the style's example scene (its subject, props or layout) unless the user asks for it.
Loop: (optional) get_selected_preset / list_presets -> build the video with the project's own tool -> render to a new file per version -> open_review -> open the URL in the built-in browser -> wait_for_feedback right away (call again while it returns status "pending", but stop after 12 pending results in a row, about 10 minutes, and tell the user to press Finish review and say "apply my FrameJam feedback"; the user sees "Your agent is listening" only while you are in this loop) -> edit -> re-render -> add_version with a note -> wait_for_feedback again.
Pass videoPath (the render) for every tool; the user always reviews the rendered file. Don't convert the project to another tool.
Each version is one round: the user comments on it and presses "Finish review", which locks it. The next version starts with no comments. The user can reopen a finished round; you then get a revised list that replaces the old one. If the comments only say the video is done or approved, don't make another version: confirm and stop waiting.
Storyboards: open_review with panelsDir (a folder of images, sorted by name) or panels [{ path, title, caption }]. Comments then say which panel ("panel 3") instead of a time. Update the images and call add_version for the next round.
When talking to the user, call a review a "project" (that's what the FrameJam UI calls it).
If the user says "apply my FrameJam feedback" (with or without a review id), call get_feedback.${skillLine()}`;

const STYLE_USE =
  "A style is a look, not a starting video. Plan the video from the user's request, then build that subject in this look: palette, textures and backgrounds, type, motion feel, transitions and pacing from guide. Don't reuse the example's subject, props, layout or story (see example) unless the user asks for them. The example composition (templateDir) is only a reference for how a technique is built, such as a texture or a title reveal; don't start from it or reskin it.";

const panelsSchema = z
  .array(
    z.union([
      z.string(),
      z.object({
        path: z.string().describe("Image path, absolute or relative to panelsDir"),
        title: z.string().optional().describe("Short shot name, e.g. 'Logo reveal'"),
        caption: z.string().optional().describe("What happens: action, camera move, voiceover line, duration"),
      }),
    ]),
  )
  .optional()
  .describe("Storyboard panels in order (png, jpg, webp, gif, svg). Use instead of videoPath.");
const panelsDirSchema = z
  .string()
  .optional()
  .describe("Storyboard: absolute path to a folder of panel images (sorted by file name), or the base folder for relative panel paths");

const DONE_NOTE = " If the comments only say it's done or approved, don't make another version: confirm with the user and stop waiting.";
const nextStep = (review: Review) =>
  (review.versions.at(-1)?.panels?.length
    ? "Apply every comment to the panels, update the images, call add_version with the new panels (or the same panelsDir) and a note, then wait_for_feedback again."
    : "Apply every comment to the video, re-render to a new file, call add_version with the new render and a note, then wait_for_feedback again.") + DONE_NOTE;

function json(data: unknown): CallToolResult["content"][number] {
  return { type: "text", text: JSON.stringify(data, null, 2) };
}

function errorResult(err: unknown): CallToolResult {
  return { isError: true, content: [{ type: "text", text: (err as Error).message ?? String(err) }] };
}

const REVISED_NOTE =
  "The user reopened their review after you received it and edited the comments. This list replaces the earlier one: drop any change from the old list that isn't here.";

function batchMessage(batches: FeedbackBatch[]) {
  const notes = batches.map((b) => b.message).filter(Boolean);
  if (batches.some((b) => b.replaces)) notes.unshift(REVISED_NOTE);
  return notes.join("\n\n") || undefined;
}

function revisedInfo(batches: FeedbackBatch[]) {
  const replaces = batches.map((b) => b.replaces).filter(Boolean);
  return replaces.length ? { revised: true, replacesBatchIds: replaces } : {};
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
  const { store, presets, playbooks } = ctx;
  const server = new McpServer(
    { name: "framejam", version: "0.1.0" },
    { instructions: serverInstructions(ctx.baseUrl), capabilities: { logging: {} } },
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
        videoPath: latest.videoPath,
        panelsDir: latest.panelsDir,
        panels: latest.panels?.map((p, i) => ({ number: i + 1, path: p.sourcePath, title: p.title, caption: p.caption })),
        message,
        comments: agentComments,
      }),
      { type: "text", text: feedbackPrompt(store, ctx.baseUrl, review, comments, { message }) },
    ];
    for (const c of agentComments.filter((c) => c.thumbnailPath).slice(0, MAX_IMAGES)) {
      content.push({ type: "text", text: `${c.panel ? "Panel" : "Frame"}${c.position ? " (pin marked)" : ""} for comment ${c.id} at ${c.at}:` });
      content.push({ type: "image", mimeType: "image/jpeg", data: fs.readFileSync(c.thumbnailPath!).toString("base64") });
    }
    return content;
  };

  server.registerTool(
    "open_review",
    {
      title: "Open a video or storyboard review",
      description:
        "Open a review page (the user calls it a project) for a rendered video from any tool, or for a storyboard (panels / panelsDir). Returns { reviewId, url, version }. " +
        "Calling it again with the same title (or panelsDir) adds a new version to the existing review; each version starts with no comments. " +
        "Use absolute paths. Show the URL to the user, then call wait_for_feedback.",
      inputSchema: {
        title: z.string().optional().describe("Human-readable title, e.g. 'Launch video'"),
        videoPath: z.string().optional().describe("Absolute path to the rendered video (mp4/webm/mov), from any tool"),
        panels: panelsSchema,
        panelsDir: panelsDirSchema,
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
              next: "Open the url in the harness's built-in browser and post it in chat as a clickable markdown link (e.g. [Open the video in FrameJam](url)), then call wait_for_feedback with this reviewId right away — don't end your turn first, or the user's feedback has nobody to go to.",
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
        "Blocks until the user presses 'Finish review' in the review UI, then returns their comments (timestamp or range, pin position, " +
        "and a frame image with the pin drawn on it). Returns { status: 'pending' } after ~50s so clients don't time out: " +
        "when that happens, call wait_for_feedback again with the same reviewId. After 12 pending results in a row (about 10 minutes) stop and tell the user to press Finish review and say 'apply my FrameJam feedback'; their comments are saved.",
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
      let lastBeat = started;
      // A `pending` result keeps the heartbeat so the UI still says "listening" until the agent calls again.
      let timedOut = false;
      store.setAgentWaiting(reviewId, true);
      try {
        while (!extra.signal.aborted) {
          const batches = store.undeliveredBatches(reviewId);
          if (batches.length) {
            store.markDelivered(reviewId, batches.map((b) => b.id));
            const review = store.getReview(reviewId);
            const ids = new Set(batches.flatMap((b) => b.commentIds));
            const comments = review.comments.filter((c) => ids.has(c.id));
            return {
              content: feedbackContent(
                review,
                comments,
                {
                  status: "feedback",
                  ...revisedInfo(batches),
                  next: nextStep(review),
                },
                batchMessage(batches),
              ),
            };
          }
          const elapsed = Date.now() - started;
          if (elapsed >= timeoutMs) {
            timedOut = true;
            break;
          }
          if (Date.now() - lastBeat >= LISTEN_HEARTBEAT_MS) {
            lastBeat = Date.now();
            store.setAgentWaiting(reviewId, true);
          }
          if (progressToken !== undefined && Date.now() - lastProgress >= progressEvery) {
            lastProgress = Date.now();
            await extra
              .sendNotification({
                method: "notifications/progress",
                params: { progressToken, progress: Math.round(elapsed / 1000), message: "Waiting for the user to finish their review" },
              })
              .catch(() => {});
          }
          await sleep(Math.min(pollMs, timeoutMs - elapsed), extra.signal);
        }
      } finally {
        if (!timedOut) store.setAgentWaiting(reviewId, false);
      }
      return {
        content: [
          json({
            status: "pending",
            reviewId,
            url: reviewUrl(ctx.baseUrl, reviewId),
            next: "No feedback yet. Call wait_for_feedback again with the same reviewId. After 12 pending results in a row (about 10 minutes), stop: tell the user to press Finish review and say \"apply my FrameJam feedback\" (their comments are saved).",
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
        "Return the user's comments without waiting. Use when the user says 'apply my FrameJam feedback'. reviewId is optional: without it, " +
        "the review whose feedback hasn't reached you yet is used. If the user wrote comments but never pressed Finish review, they are sent now " +
        "(this locks that version, as Finish review would). include='all' returns every version's comments.",
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
          return {
            content: feedbackContent(
              review,
              review.comments.filter((c) => ids.has(c.id)),
              {
                status: "feedback",
                ...revisedInfo(batches),
                versions,
                next: nextStep(review),
              },
              batchMessage(batches),
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
      description:
        "List the user's video and storyboard reviews (shown to the user as projects), newest first, with their review page URL, the latest version's file paths (videoPath / panelsDir, to match a project to the current workspace) and where each round stands.",
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
          kind: latest.panels?.length ? "storyboard" : "video",
          videoPath: latest.videoPath,
          panelsDir: latest.panelsDir,
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
        "Attach a new render, or new storyboard panels, to an existing review as v2, v3, ... The new version starts with an empty comment list. Pass a one-line note of what you changed; the user sees it when the version arrives. Prefer a new file name per render so earlier versions stay comparable. " +
        "For a storyboard, passing no media re-reads the previous panelsDir (earlier versions keep their own copies of the images).",
      inputSchema: {
        reviewId: z.string(),
        videoPath: z.string().optional().describe("Absolute path to the new render. Required for a video"),
        panels: panelsSchema,
        panelsDir: panelsDirSchema,
        note: z.string().optional().describe("What changed"),
      },
    },
    async ({ reviewId, videoPath, panels, panelsDir, note }) => {
      try {
        const review = store.addVersion(reviewId, { videoPath, panels, panelsDir, note });
        const v = review.versions.at(-1)!;
        return {
          content: [json({ reviewId, version: v.number, url: reviewUrl(ctx.baseUrl, reviewId), next: `Tell the user version ${v.number} is ready, with the url as a clickable markdown link (e.g. [Open v${v.number} in FrameJam](url)) and a one-line summary of what changed, then call wait_for_feedback.` })],
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

  const presetPayload = (id: string, includeTemplate = false) => {
    const p = presets.get(id);
    if (!p) return undefined;
    return {
      style: p.style,
      guide: p.style.guide,
      example: p.style.example,
      howToUse: STYLE_USE,
      presetDir: p.dir,
      templateDir: path.join(p.dir, "composition"),
      templateFiles: presets.templateFiles(p),
      ...(includeTemplate ? { templateSource: presets.templateSource(p) } : {}),
      previewVideo: fs.existsSync(path.join(p.dir, "preview.mp4")) ? path.join(p.dir, "preview.mp4") : undefined,
      galleryUrl: `${ctx.baseUrl}/styles/${id}`,
    };
  };

  server.registerTool(
    "get_preset",
    {
      title: "Get a style preset",
      description:
        "Return a style: its look (palette, fonts, easing, transitions, text animations, pacing), the guide of look rules, and what its example video shows. A style is a look, not a starting video: build the user's own subject in it, with any video tool. The example composition is listed in templateFiles; pass includeTemplate: true only to see how a technique is built.",
      inputSchema: {
        id: z.string(),
        includeTemplate: z.boolean().optional().describe("Also return the example composition's source (a reference, not a starting point)"),
      },
    },
    async ({ id, includeTemplate }) => {
      const payload = presetPayload(id, includeTemplate);
      if (!payload) return errorResult(new Error(`Unknown preset: ${id}. Call list_presets to see ids.`));
      return { content: [json(payload)] };
    },
  );

  server.registerTool(
    "get_selected_preset",
    {
      title: "Get the preset the user picked",
      description: "Return the style the user marked with 'Use this style' (same as get_preset), or null if none is selected. Use its look for the user's own subject; don't copy its example scene.",
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

  server.registerTool(
    "list_playbooks",
    {
      title: "List playbooks",
      description:
        "List the playbooks in the library. A playbook is the method for one kind of video (what the user brings, the steps, the tools it needs, the quality bar), for example a music video, a talking-head short or a product launch. Styles set the look; playbooks set how the video is made. Optional free-text query.",
      inputSchema: { query: z.string().optional() },
    },
    async ({ query }) => {
      const selected = store.getState().selectedPlaybook?.id;
      const list = playbooks.list(query).map(({ playbook: p }) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        bring: p.bring,
        get: p.get,
        format: p.format,
        cost: costBadge(p.needs),
        project: projectLabel(p.project),
        creator: p.creator.name,
        selected: p.id === selected,
        galleryUrl: `${ctx.baseUrl}/playbooks/${p.id}`,
      }));
      return { content: [json({ count: list.length, playbooks: list })] };
    },
  );

  const playbookPayload = (id: string) => {
    const p = playbooks.get(id);
    if (!p) return undefined;
    const presetId = store.getState().selectedPreset?.id;
    const style = presetId ? presets.get(presetId)?.style : undefined;
    return {
      playbook: p.playbook,
      playbookDir: p.dir,
      files: playbooks.files(p),
      project: projectLabel(p.playbook.project),
      stylesSentence: stylesSentence(p.playbook, style?.name),
      selectedStyle: style ? { id: style.id, name: style.name } : null,
      galleryUrl: `${ctx.baseUrl}/playbooks/${id}`,
      next:
        "Follow skill (the playbook's SKILL.md) step by step. Read files under playbookDir/references when the method points to them, and copy scripts, engine or template folders into the user's project before using them; never edit playbookDir itself. If the project already uses another tool, keep that tool and follow the method with it. Review every render in FrameJam (open_review, wait_for_feedback, add_version).",
      skill: playbooks.skillText(p),
    };
  };

  server.registerTool(
    "get_playbook",
    {
      title: "Get a playbook",
      description:
        "Return a playbook: its playbook.json (what to bring, needs, steps), the full SKILL.md method to follow, the local folder with its references, scripts and engine or template, and how the selected style combines with it.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const payload = playbookPayload(id);
      if (!payload) return errorResult(new Error(`Unknown playbook: ${id}. Call list_playbooks to see ids.`));
      return { content: [json(payload)] };
    },
  );

  server.registerTool(
    "get_selected_playbook",
    {
      title: "Get the playbook the user picked",
      description: "Return the playbook the user marked with 'Use this playbook' (same as get_playbook), or null if none is selected.",
      inputSchema: {},
    },
    async () => {
      const sel = store.getState().selectedPlaybook;
      const payload = sel ? playbookPayload(sel.id) : undefined;
      if (!sel || !payload) {
        return {
          content: [
            json({
              selected: null,
              galleryUrl: `${ctx.baseUrl}/playbooks`,
              next: "No playbook selected. That's fine: build the video the user asked for. If one in list_playbooks clearly matches the request, offer it.",
            }),
          ],
        };
      }
      return { content: [json({ selected: sel.id, selectedAt: sel.selectedAt, ...payload })] };
    },
  );

  return server;
}

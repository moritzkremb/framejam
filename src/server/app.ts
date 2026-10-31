import fs from "node:fs";
import path from "node:path";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { feedbackPrompt, latestComments, versionComments } from "../core/feedback.ts";
import { sendFile, safeJoin } from "./files.ts";
import { createMcpServer, type McpContext } from "./mcp.ts";
import { downloadsDir, setupInfo, webDistDir } from "./paths.ts";
import { chooseSavePath } from "./save-dialog.ts";
import { AppStore } from "./app-store.ts";
import { configureShare, loadShareState, ShareError, type ShareState, shareStateMtime, shareUrl } from "./share.ts";
import { isPickListening, StoreError, type NewCommentInput } from "../core/store.ts";
import { extractFrame } from "./thumbs.ts";
import { skillStatus } from "./skill.ts";
import { createTranscriber } from "./transcribe.ts";
import { createUpdateChecker } from "./update.ts";
import { VERSION } from "./version.ts";

export function createApp(ctx: McpContext) {
  const { store } = ctx;
  const { presets, playbooks } = store;
  const app = new Hono();
  const checkUpdate = createUpdateChecker(ctx.fetchLatestVersion);
  const transcriber = createTranscriber(store);

  // Without these headers browsers keep stale playbook data and posters after the files change on disk.
  app.use("/api/*", async (c, next) => {
    await next();
    if (c.res.headers.has("Cache-Control")) return;
    if (c.res.headers.get("Content-Type")?.includes("application/json")) c.res.headers.set("Cache-Control", "no-store");
    else if (/^\/api\/(playbooks|presets)\/[^/]+\/files\//.test(c.req.path)) c.res.headers.set("Cache-Control", "no-cache");
  });

  app.onError((err, c) => {
    if (err instanceof StoreError) return c.json({ error: err.message }, err.status);
    console.error("[framejam]", err);
    return c.json({ error: err.message || "Internal error" }, 500);
  });

  app.get("/api/health", async (c) =>
    c.json({
      ok: true,
      app: "framejam",
      version: VERSION,
      pid: process.pid,
      dataDir: store.root,
      cloud: store instanceof AppStore ? { on: Boolean(store.cloud()), signedOut: store.cloudSignedOut } : { on: false, signedOut: false },
      baseUrl: ctx.baseUrl,
      agent: (await store.getState()).agent ?? null,
      setup: setupInfo(),
    }),
  );

  app.get("/api/update", async (c) => c.json(await checkUpdate()));

  app.get("/api/catalog", (c) => c.json(ctx.catalog?.() ?? { enabled: false, url: "" }));

  app.get("/api/skill-status", (c) => c.json(skillStatus(ctx.skillDirs)));

  // --- Reviews -------------------------------------------------------------
  app.get("/api/reviews", async (c) =>
    c.json(
      await Promise.all(
        (await store.listReviews()).map(async (r) => {
          const latest = r.versions.at(-1)!;
          const batch = latest.batchId ? r.batches.find((b) => b.id === latest.batchId) : undefined;
          return {
            id: r.id,
            title: r.title,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            versions: r.versions.length,
            latestVersion: latest.number,
            latestSent: Boolean(latest.sentAt),
            delivered: Boolean(batch?.deliveredAt),
            draftComments: r.comments.filter((x) => x.version === latest.number && x.status === "draft").length,
            agentListening: await store.agentListening(r.id),
            hasVideo: r.versions.some((v) => v.videoPath),
            panels: latest.panels?.length ?? 0,
            ...(store instanceof AppStore && (await store.isCloud(r.id)) ? { cloud: true, upload: latest.upload ?? null } : {}),
          };
        }),
      ),
    ),
  );

  /** A frame of the latest render (or a storyboard's first panel), for the review card. Cached per version; 404 without a render or ffmpeg. */
  app.get("/api/reviews/:id/poster", async (c) => {
    const id = c.req.param("id");
    const review = await store.getReview(id);
    const latest = review.versions.at(-1)!;
    if (latest.panels?.length) {
      const file = await store.panelFileFor(id, latest, 1);
      return file ? sendFile(file, c.req.raw) : c.text("No panel", 404);
    }
    const saved = await store.posterFile(id, latest.number);
    if (saved) return sendFile(saved, c.req.raw);
    let render: { number: number; file: string } | undefined;
    for (const v of [...review.versions].reverse()) {
      const file = await store.videoFileFor(id, v);
      if (file) {
        render = { number: v.number, file };
        break;
      }
    }
    if (!render) return c.text("No render", 404);
    let poster = await store.posterFile(id, render.number);
    if (!poster) {
      const jpeg = await extractFrame(render.file, 1);
      if (!jpeg) return c.text("No frame", 404);
      poster = await store.savePoster(id, render.number, jpeg);
    }
    return sendFile(poster, c.req.raw);
  });

  const reviewJson = async (id: string) => ({
    ...(await store.getReview(id)),
    agentListening: await store.agentListening(id),
    agentOutdated: await store.agentOutdated(),
    ...(store instanceof AppStore && (await store.isCloud(id)) ? { cloud: true } : {}),
  });

  app.get("/api/reviews/:id", async (c) => c.json(await reviewJson(c.req.param("id"))));

  const shareJson = (state: ShareState) => ({
    shared: true,
    url: shareUrl(state.token),
    versions: state.versions,
    approvals: state.approvals,
    approved: state.approved ?? null,
    allowDownload: state.allowDownload !== false,
    lastPulledAt: state.lastPulledAt ?? null,
    expiresAt: state.expiresAt ?? null,
    revokedAt: state.revokedAt ?? null,
    opens: state.opens ?? null,
    lastOpenedAt: state.lastOpenedAt ?? null,
    closed: Boolean(state.revokedAt) || (state.expiresAt !== undefined && state.expiresAt <= Date.now()),
  });

  /** The project's share link, if it has one: which versions are on it, the approvals pulled so far and the link's settings. */
  app.get("/api/reviews/:id/share", async (c) => {
    const id = c.req.param("id");
    await store.getReview(id);
    const state = await loadShareState(store, id);
    return c.json(state ? shareJson(state) : { shared: false });
  });

  /** Turns the approved link's download on or off, or revokes the link (the same settings `share_project` changes). */
  app.post("/api/reviews/:id/share/settings", async (c) => {
    const id = c.req.param("id");
    await store.getReview(id);
    const body = (await c.req.json().catch(() => ({}))) as { allowDownload?: unknown; revoked?: unknown };
    const change: { allowDownload?: boolean; revoked?: boolean } = {};
    if (typeof body.allowDownload === "boolean") change.allowDownload = body.allowDownload;
    if (typeof body.revoked === "boolean") change.revoked = body.revoked;
    if (!Object.keys(change).length) return c.json({ error: "Nothing to change" }, 400);
    try {
      await configureShare(store, id, change, ctx.share || {});
    } catch (err) {
      if (err instanceof ShareError) return c.json({ error: err.message }, 400);
      throw err;
    }
    return c.json(shareJson((await loadShareState(store, id))!));
  });

  app.get("/api/reviews/:id/events", async (c) => {
    const id = c.req.param("id");
    await store.getReview(id);
    // The listening flag can expire without any file changing, so it's part of the fingerprint.
    const fingerprint = async () => `${await store.reviewMtime(id)}:${shareStateMtime(store.root, id)}:${await store.agentListening(id)}:${await store.agentOutdated()}`;
    return streamSSE(c, async (stream) => {
      let last = await fingerprint();
      let alive = true;
      stream.onAbort(() => {
        alive = false;
      });
      await stream.writeSSE({ event: "ready", data: last });
      while (alive) {
        await stream.sleep(700);
        const f = await fingerprint();
        if (f !== last) {
          last = f;
          await stream.writeSSE({ event: "changed", data: f });
        }
      }
    });
  });

  app.post("/api/reviews/:id/comments", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as NewCommentInput & { thumbnailDataUrl?: string };
    const comment = await store.addComment(id, body);
    const thumb = body.thumbnailDataUrl?.match(/^data:image\/jpeg;base64,(.+)$/)?.[1];
    if (thumb) {
      await store.saveThumbnail(id, comment.id, Buffer.from(thumb, "base64"));
    } else {
      const review = await store.getReview(id);
      const version = review.versions.find((v) => v.number === comment.version);
      const panelFile = version && comment.panel !== undefined ? await store.panelFileFor(id, version, comment.panel) : undefined;
      const file = version && (panelFile ?? (await store.videoFileFor(id, version)));
      if (panelFile) {
        const jpeg = await extractFrame(panelFile, 0);
        if (jpeg) await store.saveThumbnail(id, comment.id, jpeg);
      } else if (file) {
        const at = comment.endTime !== undefined ? (comment.time + comment.endTime) / 2 : comment.time;
        const jpeg = await extractFrame(file, at);
        if (jpeg) await store.saveThumbnail(id, comment.id, jpeg);
      }
    }
    return c.json((await store.getReview(id)).comments.find((x) => x.id === comment.id), 201);
  });

  app.patch("/api/reviews/:id/comments/:cid", async (c) => {
    const body = (await c.req.json()) as { text?: string };
    return c.json(await store.updateComment(c.req.param("id"), c.req.param("cid"), { text: body.text }));
  });

  app.delete("/api/reviews/:id/comments/:cid", async (c) => {
    await store.deleteComment(c.req.param("id"), c.req.param("cid"));
    return c.json({ ok: true });
  });

  app.post("/api/reviews/:id/submit", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { message?: string };
    const id = c.req.param("id");
    const batch = await store.submit(id, body.message);
    return c.json({ batch, agentListening: await store.agentListening(id) });
  });

  app.post("/api/reviews/:id/reopen", async (c) => {
    const id = c.req.param("id");
    const { wasDelivered } = await store.reopen(id);
    return c.json({ wasDelivered, review: await reviewJson(id) });
  });

  app.get("/api/reviews/:id/prompt", async (c) => {
    const review = await store.getReview(c.req.param("id"));
    const version = Number(c.req.query("version"));
    const comments = version ? versionComments(review, version) : latestComments(review);
    return c.text(await feedbackPrompt(store, ctx.baseUrl, review, comments, { url: await ctx.reviewUrl?.(review.id) }));
  });

  app.get("/api/reviews/:id/thumbs/:file", async (c) => {
    const file = await store.thumbnailFile(c.req.param("id"), c.req.param("file"));
    if (file === null) return c.text("Forbidden", 403);
    return file ? sendFile(file, c.req.raw) : new Response("Not found", { status: 404 });
  });

  app.get("/api/reviews/:id/versions/:n/video", async (c) => {
    const id = c.req.param("id");
    const review = await store.getReview(id);
    const version = review.versions.find((v) => v.number === Number(c.req.param("n")));
    const file = version && (await store.videoFileFor(id, version));
    if (!file) return c.text("This version has no rendered video", 404);
    return sendFile(file, c.req.raw);
  });

  app.get("/api/reviews/:id/versions/:n/transcript", async (c) => {
    const id = c.req.param("id");
    const review = await store.getReview(id);
    const version = review.versions.find((v) => v.number === Number(c.req.param("n")));
    const transcript = version && (await store.transcriptFor(id, version));
    if (!transcript) return c.json({ error: "This version has no transcript" }, 404);
    return c.json(transcript);
  });

  app.get("/api/reviews/:id/versions/:n/transcription", async (c) => c.json(await transcriber.status(c.req.param("id"), Number(c.req.param("n")))));

  /** Transcribes the render on this computer (downloading the speech model first if there's none). */
  app.post("/api/reviews/:id/versions/:n/transcription", async (c) => {
    // A JSON content type can't be sent cross-site without a preflight, so other sites can't start a download.
    if (!c.req.header("content-type")?.includes("application/json")) return c.json({ error: "Expected JSON" }, 415);
    return c.json(await transcriber.start(c.req.param("id"), Number(c.req.param("n"))));
  });

  /**
   * Saves a copy of a version's render where the user picks in the system's save dialog (which asks before
   * replacing a file). With no dialog available it goes to Downloads as "<title> v<n>.mp4", never overwriting.
   */
  app.post("/api/reviews/:id/versions/:n/download", async (c) => {
    const id = c.req.param("id");
    const review = await store.getReview(id);
    const version = review.versions.find((v) => v.number === Number(c.req.param("n")));
    const file = version && (await store.videoFileFor(id, version));
    if (!version || !file) return c.json({ error: "This version has no rendered video" }, 404);
    const dir = ctx.downloadsDir ?? downloadsDir();
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file) || ".mp4";
    const name = `${review.title} v${version.number}`.replace(/[\\/:*?"<>|]+/g, "-").trim() || "video";
    const chosen = await (ctx.chooseSavePath ?? chooseSavePath)(`${name}${ext}`, dir);
    if (chosen === null) return c.json({ cancelled: true });
    if (chosen) {
      fs.copyFileSync(file, chosen, fs.constants.COPYFILE_FICLONE);
      return c.json({ path: chosen, chosen: true });
    }
    for (let i = 1; ; i++) {
      const target = path.join(dir, `${name}${i > 1 ? ` (${i})` : ""}${ext}`);
      try {
        fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
        return c.json({ path: target, chosen: false });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
    }
  });

  app.get("/api/reviews/:id/versions/:n/panels/:panel", async (c) => {
    const id = c.req.param("id");
    const review = await store.getReview(id);
    const version = review.versions.find((v) => v.number === Number(c.req.param("n")));
    const file = version && (await store.panelFileFor(id, version, Number(c.req.param("panel"))));
    if (!file) return c.text("No such panel", 404);
    return sendFile(file, c.req.raw);
  });

  // --- Presets -------------------------------------------------------------
  app.get("/api/presets", (c) => {
    const { mood, pacing, format, q } = c.req.query();
    return c.json({ presets: presets.list({ mood, pacing, format, query: q }).map((p) => presets.summary(p)) });
  });

  app.get("/api/presets/:id", (c) => {
    const p = presets.get(c.req.param("id"));
    if (!p) return c.json({ error: "Preset not found" }, 404);
    return c.json({ preset: presets.summary(p), files: presets.templateSource(p) });
  });

  app.get("/api/presets/:id/files/*", (c) => {
    const p = presets.get(c.req.param("id"));
    if (!p) return c.text("Preset not found", 404);
    const rel = c.req.path.slice(`/api/presets/${encodeURIComponent(p.style.id)}/files/`.length);
    const file = presets.file(p, rel);
    return file ? sendFile(file, c.req.raw) : c.text("Forbidden", 403);
  });

  // --- Playbooks -----------------------------------------------------------
  app.get("/api/playbooks", (c) => {
    return c.json({ playbooks: playbooks.list(c.req.query("q")).map((p) => playbooks.summary(p)) });
  });

  app.get("/api/playbooks/:id", (c) => {
    const p = playbooks.get(c.req.param("id"));
    if (!p) return c.json({ error: "Playbook not found" }, 404);
    return c.json({ playbook: playbooks.summary(p) });
  });

  app.get("/api/playbooks/:id/files/*", (c) => {
    const p = playbooks.get(c.req.param("id"));
    if (!p) return c.text("Playbook not found", 404);
    const rel = c.req.path.slice(`/api/playbooks/${encodeURIComponent(p.playbook.id)}/files/`.length);
    const file = playbooks.file(p, rel);
    return file ? sendFile(file, c.req.raw) : c.text("Forbidden", 403);
  });

  // --- Picks: the agent waits while the user picks a playbook and style for one video ---
  app.get("/api/picks/active", async (c) => c.json(await store.activePick()));

  app.get("/api/picks/:id", async (c) => {
    const pick = await store.getPick(c.req.param("id"));
    return c.json({ ...pick, listening: isPickListening(pick) });
  });

  app.post("/api/picks/:id/dismiss", async (c) => c.json(await store.dismissPick(c.req.param("id"))));

  app.post("/api/picks/:id", async (c) => {
    const { playbookId, styleId } = (await c.req.json()) as { playbookId?: string | null; styleId?: string | null };
    if (playbookId && !playbooks.get(playbookId)) return c.json({ error: "Playbook not found" }, 404);
    if (styleId && !presets.get(styleId)) return c.json({ error: "Style not found" }, 404);
    return c.json(await store.resolvePick(c.req.param("id"), { playbookId, styleId }));
  });

  // --- MCP over streamable HTTP (stateless: one server per request) --------
  app.all("/mcp", async (c) => {
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createMcpServer(ctx);
    await server.connect(transport);
    const res = await transport.handleRequest(c.req.raw);
    return res;
  });

  // --- Web UI --------------------------------------------------------------
  app.get("*", (c) => {
    const rel = c.req.path === "/" ? "index.html" : c.req.path.slice(1);
    const file = safeJoin(webDistDir, rel);
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(file, c.req.raw);
    const index = path.join(webDistDir, "index.html");
    if (fs.existsSync(index)) return sendFile(index, c.req.raw);
    return c.html(
      "<p style='font-family:sans-serif'>The FrameJam UI is not built yet. Run <code>npm run build</code>, or use <code>npm run dev</code> and open port 2401.</p>",
    );
  });

  return app;
}
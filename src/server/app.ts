import fs from "node:fs";
import path from "node:path";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { feedbackPrompt, latestComments, versionComments } from "./feedback.ts";
import { sendFile, safeJoin } from "./files.ts";
import { createMcpServer, type McpContext } from "./mcp.ts";
import { downloadsDir, setupInfo, webDistDir } from "./paths.ts";
import { chooseSavePath } from "./save-dialog.ts";
import { StoreError, type NewCommentInput } from "./store.ts";
import { extractFrame } from "./thumbs.ts";
import { createUpdateChecker } from "./update.ts";
import { VERSION } from "./version.ts";

export function createApp(ctx: McpContext) {
  const { store, presets } = ctx;
  const app = new Hono();
  const checkUpdate = createUpdateChecker(ctx.fetchLatestVersion);

  app.onError((err, c) => {
    if (err instanceof StoreError) return c.json({ error: err.message }, err.status);
    console.error("[framejam]", err);
    return c.json({ error: err.message || "Internal error" }, 500);
  });

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      app: "framejam",
      version: VERSION,
      pid: process.pid,
      dataDir: store.root,
      baseUrl: ctx.baseUrl,
      agent: store.getState().agent ?? null,
      setup: setupInfo(),
    }),
  );

  app.get("/api/update", async (c) => c.json(await checkUpdate()));

  // --- Reviews -------------------------------------------------------------
  app.get("/api/reviews", (c) =>
    c.json(
      store.listReviews().map((r) => {
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
          agentListening: store.agentListening(r.id),
          hasVideo: r.versions.some((v) => v.videoPath),
          panels: latest.panels?.length ?? 0,
        };
      }),
    ),
  );

  /** A frame of the latest render (or a storyboard's first panel), for the review card. Cached per version; 404 without a render or ffmpeg. */
  app.get("/api/reviews/:id/poster", async (c) => {
    const id = c.req.param("id");
    const review = store.getReview(id);
    const latest = review.versions.at(-1)!;
    if (latest.panels?.length) {
      const file = store.panelFileFor(id, latest, 1);
      return file ? sendFile(file, c.req.raw) : c.text("No panel", 404);
    }
    const version = [...review.versions].reverse().find((v) => store.videoFileFor(id, v));
    if (!version) return c.text("No render", 404);
    const cached = path.join(store.reviewsDir, id, `poster-v${version.number}.jpg`);
    if (!fs.existsSync(cached)) {
      const jpeg = await extractFrame(store.videoFileFor(id, version)!, 1);
      if (!jpeg) return c.text("No frame", 404);
      fs.mkdirSync(path.dirname(cached), { recursive: true });
      fs.writeFileSync(cached, jpeg);
    }
    return sendFile(cached, c.req.raw);
  });

  const reviewJson = (id: string) => ({ ...store.getReview(id), agentListening: store.agentListening(id), agentOutdated: store.agentOutdated() });

  app.get("/api/reviews/:id", (c) => c.json(reviewJson(c.req.param("id"))));

  app.get("/api/reviews/:id/events", (c) => {
    const id = c.req.param("id");
    store.getReview(id);
    // The listening flag can expire without any file changing, so it's part of the fingerprint.
    const fingerprint = () => `${store.reviewMtime(id)}:${store.agentListening(id)}:${store.agentOutdated()}`;
    return streamSSE(c, async (stream) => {
      let last = fingerprint();
      let alive = true;
      stream.onAbort(() => {
        alive = false;
      });
      await stream.writeSSE({ event: "ready", data: last });
      while (alive) {
        await stream.sleep(700);
        const f = fingerprint();
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
    const comment = store.addComment(id, body);
    const thumb = body.thumbnailDataUrl?.match(/^data:image\/jpeg;base64,(.+)$/)?.[1];
    if (thumb) {
      store.saveThumbnail(id, comment.id, Buffer.from(thumb, "base64"));
    } else {
      const review = store.getReview(id);
      const version = review.versions.find((v) => v.number === comment.version);
      const panelFile = version && comment.panel !== undefined ? store.panelFileFor(id, version, comment.panel) : undefined;
      const file = version && (panelFile ?? store.videoFileFor(id, version));
      if (panelFile) {
        const jpeg = await extractFrame(panelFile, 0);
        if (jpeg) store.saveThumbnail(id, comment.id, jpeg);
      } else if (file) {
        const at = comment.endTime !== undefined ? (comment.time + comment.endTime) / 2 : comment.time;
        const jpeg = await extractFrame(file, at);
        if (jpeg) store.saveThumbnail(id, comment.id, jpeg);
      }
    }
    return c.json(store.getReview(id).comments.find((x) => x.id === comment.id), 201);
  });

  app.patch("/api/reviews/:id/comments/:cid", async (c) => {
    const body = (await c.req.json()) as { text?: string };
    return c.json(store.updateComment(c.req.param("id"), c.req.param("cid"), { text: body.text }));
  });

  app.delete("/api/reviews/:id/comments/:cid", (c) => {
    store.deleteComment(c.req.param("id"), c.req.param("cid"));
    return c.json({ ok: true });
  });

  app.post("/api/reviews/:id/submit", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { message?: string };
    const id = c.req.param("id");
    const batch = store.submit(id, body.message);
    return c.json({ batch, agentListening: store.agentListening(id) });
  });

  app.post("/api/reviews/:id/reopen", (c) => {
    const id = c.req.param("id");
    const { wasDelivered } = store.reopen(id);
    return c.json({ wasDelivered, review: reviewJson(id) });
  });

  app.get("/api/reviews/:id/prompt", (c) => {
    const review = store.getReview(c.req.param("id"));
    const version = Number(c.req.query("version"));
    const comments = version ? versionComments(review, version) : latestComments(review);
    return c.text(feedbackPrompt(store, ctx.baseUrl, review, comments));
  });

  app.get("/api/reviews/:id/thumbs/:file", (c) => {
    const file = safeJoin(store.thumbsDir(c.req.param("id")), c.req.param("file"));
    return file ? sendFile(file, c.req.raw) : c.text("Forbidden", 403);
  });

  app.get("/api/reviews/:id/versions/:n/video", (c) => {
    const id = c.req.param("id");
    const review = store.getReview(id);
    const version = review.versions.find((v) => v.number === Number(c.req.param("n")));
    const file = version && store.videoFileFor(id, version);
    if (!file) return c.text("This version has no rendered video", 404);
    return sendFile(file, c.req.raw);
  });

  /**
   * Saves a copy of a version's render where the user picks in the system's save dialog (which asks before
   * replacing a file). With no dialog available it goes to Downloads as "<title> v<n>.mp4", never overwriting.
   */
  app.post("/api/reviews/:id/versions/:n/download", async (c) => {
    const id = c.req.param("id");
    const review = store.getReview(id);
    const version = review.versions.find((v) => v.number === Number(c.req.param("n")));
    const file = version && store.videoFileFor(id, version);
    if (!version || !file) return c.json({ error: "This version has no rendered video" }, 404);
    const dir = ctx.downloadsDir ?? downloadsDir();
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file) || ".mp4";
    const name = `${review.title} v${version.number}`.replace(/[\\/:*?"<>|]+/g, "-").trim() || "video";
    const chosen = await (ctx.chooseSavePath ?? chooseSavePath)(`${name}${ext}`, dir);
    if (chosen === null) return c.json({ cancelled: true });
    if (chosen) {
      fs.copyFileSync(file, chosen);
      return c.json({ path: chosen, chosen: true });
    }
    for (let i = 1; ; i++) {
      const target = path.join(dir, `${name}${i > 1 ? ` (${i})` : ""}${ext}`);
      try {
        fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
        return c.json({ path: target, chosen: false });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
    }
  });

  app.get("/api/reviews/:id/versions/:n/panels/:panel", (c) => {
    const id = c.req.param("id");
    const review = store.getReview(id);
    const version = review.versions.find((v) => v.number === Number(c.req.param("n")));
    const file = version && store.panelFileFor(id, version, Number(c.req.param("panel")));
    if (!file) return c.text("No such panel", 404);
    return sendFile(file, c.req.raw);
  });

  // --- Presets -------------------------------------------------------------
  app.get("/api/presets", (c) => {
    const { mood, pacing, format, q } = c.req.query();
    const selected = store.getState().selectedPreset?.id ?? null;
    return c.json({ selected, presets: presets.list({ mood, pacing, format, query: q }).map((p) => presets.summary(p)) });
  });

  app.get("/api/presets/:id", (c) => {
    const p = presets.get(c.req.param("id"));
    if (!p) return c.json({ error: "Preset not found" }, 404);
    const selected = store.getState().selectedPreset?.id ?? null;
    return c.json({ preset: presets.summary(p), selected, files: presets.templateSource(p) });
  });

  app.get("/api/presets/:id/files/*", (c) => {
    const p = presets.get(c.req.param("id"));
    if (!p) return c.text("Preset not found", 404);
    const rel = c.req.path.slice(`/api/presets/${encodeURIComponent(p.style.id)}/files/`.length);
    const file = safeJoin(p.dir, rel);
    return file ? sendFile(file, c.req.raw) : c.text("Forbidden", 403);
  });

  app.get("/api/selected-preset", (c) => c.json(store.getState().selectedPreset ?? null));

  app.put("/api/selected-preset", async (c) => {
    const { id } = (await c.req.json()) as { id: string | null };
    if (id && !presets.get(id)) return c.json({ error: "Preset not found" }, 404);
    return c.json(store.setSelectedPreset(id).selectedPreset ?? null);
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
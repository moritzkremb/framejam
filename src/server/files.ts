import fs from "node:fs";
import path from "node:path";
import { getHyperframeRuntimeScript } from "@hyperframes/core/runtime-script";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

export function mimeFor(file: string) {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Resolves `rel` inside `root`, refusing anything that escapes it. */
export function safeJoin(root: string, rel: string): string | undefined {
  const full = path.resolve(root, `.${path.sep}${decodeURIComponent(rel)}`);
  if (full !== root && !full.startsWith(root + path.sep)) return undefined;
  return full;
}

/** Streams a file with HTTP Range support so <video> can seek. */
export function sendFile(file: string, req: Request): Response {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("Not found", { status: 404 });
  const size = fs.statSync(file).size;
  const type = mimeFor(file);
  const range = req.headers.get("range");
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-cache" };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m?.[1] ? Number(m[1]) : 0;
    let end = m?.[2] ? Number(m[2]) : size - 1;
    if (!m?.[1] && m?.[2]) {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    }
    if (start >= size || end < start) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    const stream = fs.createReadStream(file, { start, end });
    return new Response(toWebStream(stream), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(toWebStream(fs.createReadStream(file)), { headers: { ...headers, "content-length": String(size) } });
}

function toWebStream(stream: fs.ReadStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });
}

const GSAP_CDN = /https?:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/gsap@[^/"']+\/dist\/([\w.-]+\.js)/g;
let runtimeScript: string | undefined;

/**
 * Prepares a Hyperframes composition for the in-app player: serves GSAP from the
 * local install (works offline) and injects the Hyperframes runtime, which exposes
 * `window.__player` (play/pause/seek/getTime/getDuration) and manages clip visibility
 * and media sync exactly like the renderer.
 */
export function prepareCompositionHtml(html: string): string {
  runtimeScript ??= getHyperframeRuntimeScript().replace(/<\/script/gi, "<\\/script");
  const rewritten = html.replace(GSAP_CDN, (_m, file: string) => `/vendor/gsap/${file}`);
  const inject = `<script data-framecut="hyperframes-runtime">${runtimeScript}</script>`;
  return rewritten.includes("</body>") ? rewritten.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${inject}</body>`) : rewritten + inject;
}

export function sendCompositionFile(root: string, rel: string, req: Request): Response {
  const file = safeJoin(root, rel || "index.html");
  if (!file) return new Response("Forbidden", { status: 403 });
  if (file.endsWith(".html") && fs.existsSync(file)) {
    const html = prepareCompositionHtml(fs.readFileSync(file, "utf8"));
    return new Response(html, { headers: { "content-type": MIME[".html"], "cache-control": "no-cache" } });
  }
  return sendFile(file, req);
}

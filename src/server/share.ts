/**
 * Sharing from the local app (H1.5). Projects stay in `~/.framejam`; sharing uploads one version's files to FrameJam
 * Cloud and puts it on the project's link, and pulling brings guests' comments and approvals back into the project.
 *
 * Everything the cloud knows about a project is derived from the project's id, so the only thing kept here is
 * `shares/<project id>.json`: the link, which versions are on it, and the approvals pulled so far. The `Store`
 * interface is not involved beyond its existing methods.
 */
import fs from "node:fs";
import path from "node:path";
import { StoreError, type NewCommentInput, type Store } from "../core/store.ts";
import type { Review, ReviewVersion } from "../core/types.ts";
import { readAuth } from "./auth.ts";
import type { ShareHooks, ShareLinkSummary } from "../core/share.ts";
import {
  type AssetKind,
  type FetchLike,
  type GuestApproval,
  type GuestComment,
  type PublishInput,
  type Resolution,
  type ShareClient,
  createShareClient,
} from "./cloud.ts";
import { AppStore } from "./app-store.ts";
import type { CloudStore } from "./cloud-store.ts";
import type { CloudLink } from "./cloud-api.ts";
import { mimeFor } from "./files.ts";
import { resolveCloudUrl } from "./login.ts";
import { extractFrame } from "./thumbs.ts";
import { MAX_UPLOAD_BYTES, putFile, ShareError } from "./upload.ts";

/** Where guests open a link. The page itself arrives with the share page batch. */
export const SHARE_BASE_URL = "https://www.framejam.ai/v";
/** A guest's frame image is a small JPEG; refuse anything much bigger. */
const MAX_FRAME_BYTES = 5 * 1024 * 1024;
export const PULL_INTERVAL_MS = 30_000;

export { ShareError, MAX_UPLOAD_BYTES };

export const shareUrl = (token: string) => `${SHARE_BASE_URL}/${token}`;

export interface ShareState {
  /** The cloud deployment the link lives on, so a project isn't pulled from another one. */
  cloudUrl: string;
  /** The link token. */
  token: string;
  /** Versions that are on the link, ascending. */
  versions: number[];
  /** Every approval seen on the link, oldest first. */
  approvals: GuestApproval[];
  sharedAt: string;
  lastPulledAt?: string;
  expiresAt?: number;
  revokedAt?: number;
  /** Set while a guest's approval has made the link final. */
  approved?: { version: number; by: string; at: number };
  /** The `at` of the approval an agent was last told about. */
  approvalSeenAt?: number;
  /** The creator's download switch; unset means on. */
  allowDownload?: boolean;
  /** Opens of the link, as last reported by the cloud. Unset until a cloud that counts them has answered. */
  opens?: number;
  lastOpenedAt?: number;
  /** Cloud ids of the guest comments already marked "resolved in vN" on the link. */
  resolvedSynced?: string[];
}

export function sharesDir(root: string): string {
  return path.join(root, "shares");
}

function stateFile(root: string, reviewId: string): string {
  if (!/^[\w-]+$/.test(reviewId)) throw new StoreError(`Invalid review id: ${reviewId}`);
  return path.join(sharesDir(root), `${reviewId}.json`);
}

export function readShareState(root: string, reviewId: string): ShareState | undefined {
  try {
    return JSON.parse(fs.readFileSync(stateFile(root, reviewId), "utf8")) as ShareState;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" || err instanceof SyntaxError) return undefined;
    throw err;
  }
}

function writeShareState(root: string, reviewId: string, state: ShareState): void {
  const file = stateFile(root, reviewId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/** When the project's link state last changed, so the review page can show a new approval without a reload. */
export function shareStateMtime(root: string, reviewId: string): number {
  try {
    return fs.statSync(stateFile(root, reviewId)).mtimeMs;
  } catch {
    return 0;
  }
}

/** The ids of every project that has a link. */
export function sharedProjectIds(root: string): string[] {
  try {
    return fs
      .readdirSync(sharesDir(root))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length));
  } catch {
    return [];
  }
}

export interface ShareOptions {
  /** Tests inject a client; otherwise one is made from the saved login. */
  client?: ShareClient;
  fetch?: FetchLike;
  now?: () => Date;
}

interface Session {
  client: ShareClient;
  cloudUrl: string;
}

function session(root: string, opts: ShareOptions): Session | undefined {
  const auth = readAuth(root);
  if (!auth) return undefined;
  const url = resolveCloudUrl(auth.cloudUrl);
  return { client: opts.client ?? createShareClient(auth.token, url, opts.fetch), cloudUrl: url };
}

function requireSession(root: string, opts: ShareOptions): Session {
  const s = session(root, opts);
  if (!s) throw new ShareError("You're not signed in to FrameJam Cloud. Run: framejam login");
  return s;
}

/** A project by its id, or by title when exactly one project has it. */
export async function findProject(store: Store, ref: string): Promise<Review> {
  try {
    const exact = await store.findReview(ref);
    if (exact) return exact;
  } catch {
    // Not a valid project id; try it as a title.
  }
  const wanted = ref.trim().toLowerCase();
  const matches = (await store.listReviews()).filter((r) => r.title.trim().toLowerCase() === wanted);
  if (matches.length === 1) return matches[0]!;
  if (!matches.length) throw new ShareError(`No project called "${ref}". Use its id (rev_…) or its exact title.`);
  throw new ShareError(`More than one project is called "${ref}": ${matches.map((r) => r.id).join(", ")}. Use its id.`);
}

async function uploadFile(client: ShareClient, file: string, kind: AssetKind, fetchFn: FetchLike, extra: { posterKey?: string } = {}) {
  const mime = mimeFor(file);
  const ticket = await client.requestUpload({ filename: path.basename(file), mime, kind });
  const bytes = await putFile(ticket.uploadUrl, file, mime, fetchFn);
  const { assetId } = await client.registerUpload({ storageKey: ticket.storageKey, bytes, mime, ...extra });
  return { assetId, storageKey: ticket.storageKey };
}

async function posterFor(store: Store, review: Review, version: ReviewVersion, render: string): Promise<string | undefined> {
  const cached = await store.posterFile(review.id, version.number);
  if (cached) return cached;
  const jpeg = await extractFrame(render, 1);
  return jpeg ? await store.savePoster(review.id, version.number, jpeg) : undefined;
}

export interface ShareResult {
  url: string;
  version: number;
  /** False when the version was already on the link and nothing was uploaded. */
  uploaded: boolean;
  /** The link was revoked or has expired; guests can't open it. */
  closed: boolean;
  pulled: PullResult;
}

/**
 * Puts one version of a project on its link, creating the link the first time. Every later version goes to the same
 * link. A version already on the link isn't uploaded again.
 */
export async function shareVersion(
  store: Store,
  reviewId: string,
  opts: ShareOptions & { version?: number } = {},
): Promise<ShareResult> {
  const cloud = await cloudOf(store, reviewId);
  if (cloud) return await cloudShareVersion(cloud, store, reviewId, opts.version);
  const { client, cloudUrl } = requireSession(store.root, opts);
  const fetchFn = opts.fetch ?? fetch;
  const review = await store.getReview(reviewId);
  const number = opts.version ?? review.versions.at(-1)!.number;
  const version = review.versions.find((v) => v.number === number);
  if (!version) throw new ShareError(`${review.title} has no version ${number}.`);

  let state = readShareState(store.root, review.id);
  if (state && state.cloudUrl !== cloudUrl) state = undefined;
  const already = Boolean(state?.versions.includes(number));

  if (!already) {
    const input: PublishInput = { localId: review.id, title: review.title, kind: version.panels?.length ? "storyboard" : "video", version: { number, note: version.note } };
    if (version.panels?.length) {
      const panels = [];
      for (const [i, panel] of version.panels.entries()) {
        const file = await store.panelFileFor(review.id, version, i + 1);
        if (!file) throw new ShareError(`Panel ${i + 1} of version ${number} isn't on this computer any more.`);
        const { assetId } = await uploadFile(client, file, "panel", fetchFn);
        panels.push({ assetId, title: panel.title, caption: panel.caption });
      }
      input.version.panels = panels;
    } else {
      const render = await store.videoFileFor(review.id, version);
      if (!render) throw new ShareError(`The render of version ${number} isn't on this computer any more.`);
      const posterFile = await posterFor(store, review, version, render);
      const poster = posterFile ? await uploadFile(client, posterFile, "poster", fetchFn) : undefined;
      const { assetId } = await uploadFile(client, render, "render", fetchFn, { posterKey: poster?.storageKey });
      input.version.videoAssetId = assetId;
    }

    const published = await client.publish(input);
    state = {
      cloudUrl,
      token: published.token,
      versions: [...new Set([...(state?.versions ?? []), number])].sort((a, b) => a - b),
      approvals: state?.approvals ?? [],
      sharedAt: state?.sharedAt ?? (opts.now?.() ?? new Date()).toISOString(),
      lastPulledAt: state?.lastPulledAt,
      expiresAt: published.expiresAt ?? undefined,
      revokedAt: published.revokedAt ?? undefined,
      approvalSeenAt: state?.approvalSeenAt,
      allowDownload: state?.allowDownload,
      resolvedSynced: state?.resolvedSynced,
    };
    writeShareState(store.root, review.id, state);
  }

  const pulled = await pullShare(store, review.id, opts);
  const current = readShareState(store.root, review.id)!;
  const closed = Boolean(current.revokedAt) || (current.expiresAt !== undefined && current.expiresAt <= Date.now());
  return { url: shareUrl(current.token), version: number, uploaded: !already, closed, pulled };
}

export interface PullResult {
  /** Guest comments added to the project. */
  added: number;
  /** Comments left on the link because the project's latest version is already sent; they come in with the next version. */
  waiting: number;
  /** Approvals on the link. */
  approvals: number;
  /** Guest comments newly marked "resolved in vN" on the link. */
  resolved: number;
  /** Why marking comments resolved failed, if it did. The pull itself went through. */
  resolveError?: string;
  /** Opens of the link, when the cloud reports them. */
  opens?: number;
}

const openedTimes = (n: number) => (n === 1 ? "once" : `${n} times`);

const EMPTY_PULL: PullResult = { added: 0, waiting: 0, approvals: 0, resolved: 0 };

/** What the project has for a guest comment, or undefined when the comment can't be added right now. */
function commentInput(review: Review, c: GuestComment): NewCommentInput | undefined {
  const latest = review.versions.at(-1)!;
  if (latest.sentAt) return undefined;
  const panels = latest.panels?.length ?? 0;
  const outOfRange = panels > 0 && !c.wholeVideo && (c.panel === undefined || c.panel < 1 || c.panel > panels);
  return {
    version: latest.number,
    kind: c.kind,
    time: c.time,
    endTime: c.endTime,
    x: c.x,
    y: c.y,
    panel: c.panel,
    wholeVideo: c.wholeVideo || outOfRange || undefined,
    text: c.text,
    author: c.guestName,
    cloudId: c.id,
    fromVersion: c.version !== latest.number ? c.version : undefined,
    voice: c.voice
      ? {
          status: c.voice.status,
          duration: c.voice.duration,
          audioUrl: c.voice.audioUrl,
          note: c.voice.note,
          points: c.voice.points.map((p) => ({ phrase: p.phrase, at: p.at, time: p.time, x: p.x, y: p.y, drawn: p.drawing?.length ? true : undefined })),
        }
      : undefined,
  };
}

async function downloadFrame(url: string, fetchFn: FetchLike): Promise<Uint8Array | undefined> {
  if (!/^https?:\/\//i.test(url)) return undefined;
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return undefined;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength > 0 && bytes.byteLength <= MAX_FRAME_BYTES ? bytes : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Brings what guests did on a project's link into the project. Comments become drafts on the latest version, marked
 * with who wrote them, so the creator sees them first; none go to the agent until the creator presses Finish review.
 * Approvals are kept with the link's details. Safe to repeat: a comment is added once, and the cloud is told about it
 * only after the project has it.
 */
export async function pullShare(store: Store, reviewId: string, opts: ShareOptions = {}): Promise<PullResult> {
  const state = readShareState(store.root, reviewId);
  if (!state) return EMPTY_PULL;
  const s = session(store.root, opts);
  if (!s || s.cloudUrl !== state.cloudUrl) return EMPTY_PULL;
  const fetchFn = opts.fetch ?? fetch;

  const pending = await s.client.pending(reviewId);
  if (!pending) return EMPTY_PULL;

  const acknowledge: string[] = [];
  let added = 0;
  let waiting = 0;
  for (const c of pending.comments) {
    const review = await store.getReview(reviewId);
    if (review.comments.some((x) => x.cloudId === c.id)) {
      acknowledge.push(c.id);
      continue;
    }
    const input = commentInput(review, c);
    if (!input) {
      waiting++;
      continue;
    }
    const comment = await store.addComment(reviewId, input);
    acknowledge.push(c.id);
    added++;
    if (c.frameUrl) {
      const jpeg = await downloadFrame(c.frameUrl, fetchFn);
      if (jpeg) await store.saveThumbnail(reviewId, comment.id, jpeg);
    }
    for (const [i, p] of (c.voice?.points ?? []).entries()) {
      const jpeg = p.frameUrl ? await downloadFrame(p.frameUrl, fetchFn) : undefined;
      if (jpeg) await store.saveThumbnail(reviewId, comment.id, jpeg, i);
    }
  }
  if (acknowledge.length) await s.client.markPulled(reviewId, acknowledge);

  const synced = await syncResolutions(store, reviewId, state, s.client);
  writeShareState(store.root, reviewId, {
    ...state,
    approvals: pending.approvals,
    lastPulledAt: (opts.now?.() ?? new Date()).toISOString(),
    ...(pending.expiresAt !== undefined ? { expiresAt: pending.expiresAt ?? undefined } : {}),
    ...(pending.revokedAt !== undefined ? { revokedAt: pending.revokedAt ?? undefined } : {}),
    ...(pending.approved !== undefined ? { approved: pending.approved ?? undefined } : {}),
    ...(pending.allowDownload !== undefined ? { allowDownload: pending.allowDownload } : {}),
    ...(typeof pending.opens === "number" ? { opens: pending.opens, lastOpenedAt: pending.lastOpenedAt ?? undefined } : {}),
    resolvedSynced: synced.ids,
  });
  return { added, waiting, approvals: pending.approvals.length, resolved: synced.newly, resolveError: synced.error, opens: typeof pending.opens === "number" ? pending.opens : undefined };
}

/**
 * Tells the link which guest comments the agent has fixed. A comment qualifies once the project marks it resolved in
 * a version that is on the link and newer than the one it was written on, so a guest never reads "resolved in v3"
 * before v3 is there. Each id is sent once; the cloud keeps the first resolution if a call is repeated.
 */
async function syncResolutions(
  store: Store,
  reviewId: string,
  state: ShareState,
  client: ShareClient,
): Promise<{ ids: string[]; newly: number; error?: string }> {
  const done = new Set(state.resolvedSynced ?? []);
  const review = await store.getReview(reviewId);
  const onLink = new Set(state.versions);
  const due: Resolution[] = [];
  for (const c of review.comments) {
    const version = c.resolution?.version;
    if (!c.cloudId || c.status !== "resolved" || version === undefined || done.has(c.cloudId)) continue;
    if (!onLink.has(version) || version <= c.version) continue;
    due.push({ commentId: c.cloudId, version });
  }
  if (!due.length) return { ids: [...done], newly: 0 };
  try {
    await client.resolve(reviewId, due);
  } catch (err) {
    return { ids: [...done], newly: 0, error: err instanceof Error ? err.message : String(err) };
  }
  for (const r of due) done.add(r.commentId);
  return { ids: [...done], newly: due.length };
}

/** Pulls every shared project. A project that fails doesn't stop the others. */
export async function pullAll(store: Store, opts: ShareOptions = {}): Promise<{ pulled: number; errors: string[] }> {
  const errors: string[] = [];
  let pulled = 0;
  if (!readAuth(store.root)) return { pulled, errors };
  for (const id of sharedProjectIds(store.root)) {
    try {
      const result = await pullShare(store, id, opts);
      pulled += result.added;
      if (result.resolveError) errors.push(result.resolveError);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { pulled, errors };
}

/**
 * Keeps pulling guest comments while the local server runs. Does nothing when signed out or when nothing is shared.
 * A failure is logged once until it clears.
 */
export function startSharePuller(
  store: Store,
  log: (msg: string) => void,
  opts: ShareOptions & { intervalMs?: number; firstDelayMs?: number } = {},
): () => void {
  let running = false;
  let lastError: string | undefined;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { pulled, errors } = await pullAll(store, opts);
      if (pulled) log(`framejam: ${pulled} new comment${pulled === 1 ? "" : "s"} from shared links`);
      const error = errors[0];
      if (error && error !== lastError) log(`framejam: couldn't pull comments from shared links: ${error}`);
      lastError = error;
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, opts.firstDelayMs ?? 3_000);
  const every = setInterval(tick, opts.intervalMs ?? PULL_INTERVAL_MS);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}

/** What the CLI prints after sharing. */
export function describeShare(result: ShareResult): string {
  const lines = [result.url];
  lines.push(result.uploaded ? `Shared version ${result.version}.` : `Version ${result.version} was already on the link.`);
  if (result.closed) lines.push("This link is closed (revoked or expired), so guests can't open it.");
  if (result.pulled.added) lines.push(`${result.pulled.added} new comment${result.pulled.added === 1 ? "" : "s"} from guests, added as drafts.`);
  if (result.pulled.waiting) lines.push(`${result.pulled.waiting} more will come in with your next version.`);
  if (result.pulled.resolved) lines.push(`${result.pulled.resolved} guest comment${result.pulled.resolved === 1 ? "" : "s"} marked resolved on the link.`);
  if (result.pulled.resolveError) lines.push(`Couldn't mark comments resolved on the link: ${result.pulled.resolveError}`);
  if (result.pulled.opens) lines.push(`The link has been opened ${openedTimes(result.pulled.opens)}.`);
  return lines.join("\n");
}

const DAY_MS = 24 * 60 * 60 * 1000;

const isClosed = (state: Pick<ShareState, "expiresAt" | "revokedAt">) =>
  Boolean(state.revokedAt) || (state.expiresAt !== undefined && state.expiresAt <= Date.now());

/** What an agent or the CLI is told about one project's link. */
export function summarizeShare(review: Review, state: ShareState): ShareLinkSummary {
  const waiting = review.comments.filter((c) => c.author && c.status === "draft").length;
  return {
    reviewId: review.id,
    title: review.title,
    url: shareUrl(state.token),
    versionsOnLink: state.versions,
    latestVersion: review.versions.at(-1)!.number,
    closed: isClosed(state),
    expiresAt: state.expiresAt ? new Date(state.expiresAt).toISOString() : undefined,
    revokedAt: state.revokedAt ? new Date(state.revokedAt).toISOString() : undefined,
    approvals: state.approvals.map((a) => ({ version: a.version, by: a.guestName, at: new Date(a.at).toISOString() })),
    ...(state.approved
      ? {
          approved: { version: state.approved.version, by: state.approved.by, at: new Date(state.approved.at).toISOString() },
          approvalNew: state.approvalSeenAt !== state.approved.at,
        }
      : {}),
    allowDownload: state.allowDownload !== false,
    guestCommentsWaiting: waiting,
    ...(state.opens === undefined ? {} : { opens: state.opens, lastOpenedAt: state.lastOpenedAt ? new Date(state.lastOpenedAt).toISOString() : undefined }),
    lastPulledAt: state.lastPulledAt,
  };
}

/** Every project that has a link here, newest share first. Reads this computer only, so it works offline. */
export async function listShares(store: Store): Promise<ShareLinkSummary[]> {
  const out: { at: string; summary: ShareLinkSummary }[] = [];
  for (const id of sharedProjectIds(store.root)) {
    const state = readShareState(store.root, id);
    if (!state) continue;
    let review: Review;
    try {
      review = await store.getReview(id);
    } catch {
      continue;
    }
    out.push({ at: state.sharedAt, summary: summarizeShare(review, state) });
  }
  const cloud = store instanceof AppStore ? store.cloud() : undefined;
  if (cloud) {
    try {
      for (const item of await cloud.api.links()) {
        if (item.link.sharedVersion === null) continue;
        const review = await store.getReview(item.reviewId);
        out.push({ at: new Date(item.link.createdAt).toISOString(), summary: summarizeShare(review, cloudStateOf(cloud, review, item.link)!) });
      }
    } catch {
      // Offline: the links on this computer still list.
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).map((x) => x.summary);
}

/**
 * Sets when a project's link stops working, revokes or reopens it, or switches the approved link's download.
 * `expiresInDays: null` removes the expiry.
 * The link has to exist: share a version first.
 */
export async function configureShare(
  store: Store,
  reviewId: string,
  change: { expiresInDays?: number | null; revoked?: boolean; allowDownload?: boolean },
  opts: ShareOptions = {},
): Promise<ShareLinkSummary> {
  const cloud = await cloudOf(store, reviewId);
  const { client, cloudUrl } = cloud ? { client: { configure: (id: string, settings: Parameters<ShareClient["configure"]>[1]) => cloud.api.configure(id, settings) }, cloudUrl: cloud.api.url } : requireSession(store.root, opts);
  const state = cloud ? await cloudState(cloud, store, reviewId) : readShareState(store.root, reviewId);
  if (!state || state.cloudUrl !== cloudUrl) throw new ShareError("This project isn't shared yet. Share a version first.");
  const days = change.expiresInDays;
  if (typeof days === "number" && (!Number.isFinite(days) || days <= 0)) throw new ShareError("expiresInDays has to be a number of days above 0.");
  const settings = await client.configure(reviewId, {
    ...(days === undefined ? {} : { expiresAt: days === null ? null : (opts.now?.() ?? new Date()).getTime() + days * DAY_MS }),
    ...(change.revoked === undefined ? {} : { revoked: change.revoked }),
    ...(change.allowDownload === undefined ? {} : { allowDownload: change.allowDownload }),
  });
  if (cloud) {
    cloud.refresh(reviewId);
    return summarizeShare(await store.getReview(reviewId), (await cloudState(cloud, store, reviewId))!);
  }
  const next: ShareState = {
    ...state,
    expiresAt: settings.expiresAt ?? undefined,
    revokedAt: settings.revokedAt ?? undefined,
    ...(settings.allowDownload === undefined ? {} : { allowDownload: settings.allowDownload }),
  };
  writeShareState(store.root, reviewId, next);
  return summarizeShare(await store.getReview(reviewId), next);
}

/** Remembers that an agent was told about the link's current approval. */
export async function markApprovalSeen(target: Store | string, reviewId: string): Promise<void> {
  const cloud = typeof target === "string" ? undefined : await cloudOf(target, reviewId);
  if (cloud) {
    await cloud.api.approvalSeen(reviewId);
    return;
  }
  const root = typeof target === "string" ? target : target.root;
  const state = readShareState(root, reviewId);
  if (state?.approved && state.approvalSeenAt !== state.approved.at) {
    writeShareState(root, reviewId, { ...state, approvalSeenAt: state.approved.at });
  }
}

/** The share tools an agent gets over MCP, on this computer's store and saved login. */
export function createShareHooks(store: Store, opts: ShareOptions = {}): ShareHooks {
  return {
    async share(reviewId, { version } = {}) {
      const result = await shareVersion(store, reviewId, { ...opts, version });
      const review = await store.getReview(reviewId);
      return {
        url: result.url,
        version: result.version,
        uploaded: result.uploaded,
        closed: result.closed,
        newGuestComments: result.pulled.added,
        waitingForNextVersion: result.pulled.waiting,
        markedResolved: result.pulled.resolved,
        resolveError: result.pulled.resolveError,
        link: summarizeShare(review, (await loadShareState(store, reviewId))!),
      };
    },
    configure: (reviewId, change) => configureShare(store, reviewId, change, opts),
    approvalSeen: (reviewId) => markApprovalSeen(store, reviewId),
    list: () => listShares(store),
    async link(reviewId) {
      const state = await loadShareState(store, reviewId);
      return state ? summarizeShare(await store.getReview(reviewId), state) : undefined;
    },
    signedIn: () => Boolean(readAuth(store.root)),
  };
}

// --- Projects that live in FrameJam Cloud: the files are already there, so sharing is only the link -------------------

/** The cloud store that holds a project, or undefined when it's a local one (or cloud mode is off). */
export async function cloudOf(store: Store, reviewId: string): Promise<CloudStore | undefined> {
  return store instanceof AppStore ? await store.cloudFor(reviewId) : undefined;
}

/** The link as the local code reads it, built from the cloud's answer; undefined until a version is on it. */
function cloudStateOf(cloud: CloudStore, review: Review, link: CloudLink | null): ShareState | undefined {
  if (!link || link.sharedVersion === null) return undefined;
  const upTo = link.sharedVersion;
  return {
    cloudUrl: cloud.api.url,
    token: link.token,
    versions: review.versions.map((v) => v.number).filter((n) => n <= upTo),
    approvals: link.approvals,
    sharedAt: new Date(link.createdAt).toISOString(),
    expiresAt: link.expiresAt ?? undefined,
    revokedAt: link.revokedAt ?? undefined,
    approved: link.approved ?? undefined,
    approvalSeenAt: link.approvalSeenAt ?? undefined,
    allowDownload: link.allowDownload,
    opens: link.opens,
    lastOpenedAt: link.lastOpenedAt ?? undefined,
  };
}

async function cloudState(cloud: CloudStore, store: Store, reviewId: string): Promise<ShareState | undefined> {
  return cloudStateOf(cloud, await store.getReview(reviewId), await cloud.linkOf(reviewId));
}

/** A project's link: from the cloud for a cloud project, from this computer's share file otherwise. */
export async function loadShareState(store: Store, reviewId: string): Promise<ShareState | undefined> {
  const cloud = await cloudOf(store, reviewId);
  return cloud ? await cloudState(cloud, store, reviewId) : readShareState(store.root, reviewId);
}

/** Puts a version on a cloud project's link. Nothing is uploaded here: it waits for the version's own upload to finish. */
async function cloudShareVersion(cloud: CloudStore, store: Store, reviewId: string, requested: number | undefined): Promise<ShareResult> {
  const review = await store.getReview(reviewId);
  const number = requested ?? review.versions.at(-1)!.number;
  if (!review.versions.some((v) => v.number === number)) throw new ShareError(`${review.title} has no version ${number}.`);
  try {
    await cloud.waitForUpload(reviewId, number);
    const out = await cloud.api.share(reviewId, number);
    cloud.refresh(reviewId);
    const state = cloudStateOf(cloud, await store.getReview(reviewId), out)!;
    return {
      url: shareUrl(out.token),
      version: number,
      uploaded: out.newOnLink,
      closed: isClosed(state),
      pulled: { added: 0, waiting: 0, approvals: out.approvals.length, resolved: 0, opens: out.opens },
    };
  } catch (err) {
    if (err instanceof ShareError) throw err;
    throw new ShareError(err instanceof Error ? err.message : String(err));
  }
}

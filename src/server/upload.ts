import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { FetchLike } from "./cloud.ts";

/** R2 takes one presigned PUT up to 5 GB; larger files need multipart, which isn't built. */
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3;

export class ShareError extends Error {}

export interface PutOptions {
  /** Tries before giving up on a dropped connection or a 5xx. Each try streams the file again. */
  attempts?: number;
  /** Pause before the next try, doubled each time. */
  retryDelayMs?: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function reason(err: unknown): string {
  const cause = (err as { cause?: { code?: unknown } } | undefined)?.cause;
  return typeof cause?.code === "string" ? ` (${cause.code})` : "";
}

/**
 * PUTs a file to a presigned URL as a stream, so a large render never sits in memory. `onBytes` hears how many bytes
 * have been handed to the connection so far. A dropped connection or a 5xx is tried again when `attempts` allows it.
 */
export async function putFile(
  uploadUrl: string,
  file: string,
  mime: string,
  fetchFn: FetchLike,
  onBytes?: (sent: number) => void,
  options: PutOptions = {},
): Promise<number> {
  const bytes = fs.statSync(file).size;
  if (bytes > MAX_UPLOAD_BYTES) throw new ShareError(`${path.basename(file)} is larger than 5 GB, which sharing doesn't support yet.`);
  const attempts = Math.max(1, options.attempts ?? 1);
  let failure: ShareError | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await wait((options.retryDelayMs ?? 1000) * 2 ** (attempt - 2));
    let sent = 0;
    async function* chunks() {
      for await (const chunk of fs.createReadStream(file)) {
        sent += (chunk as Buffer).length;
        onBytes?.(sent);
        yield chunk as Buffer;
      }
    }
    let res: Response;
    try {
      res = await fetchFn(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mime, "Content-Length": String(bytes) },
        body: Readable.toWeb(Readable.from(chunks())) as unknown as BodyInit,
        duplex: "half",
      } as RequestInit);
    } catch (err) {
      failure = new ShareError(`Couldn't upload the file to FrameJam Cloud${reason(err)}.`);
      continue;
    }
    if (res.ok) return bytes;
    failure = new ShareError(`Uploading to FrameJam Cloud failed (${res.status}).`);
    if (res.status < 500) break;
  }
  throw failure!;
}

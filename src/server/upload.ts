import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { FetchLike } from "./cloud.ts";

/** R2 takes one presigned PUT up to 5 GB; larger files need multipart, which isn't built. */
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3;

export class ShareError extends Error {}

/**
 * PUTs a file to a presigned URL as a stream, so a large render never sits in memory. `onBytes` hears how many bytes
 * have been handed to the connection so far.
 */
export async function putFile(uploadUrl: string, file: string, mime: string, fetchFn: FetchLike, onBytes?: (sent: number) => void): Promise<number> {
  const bytes = fs.statSync(file).size;
  if (bytes > MAX_UPLOAD_BYTES) throw new ShareError(`${path.basename(file)} is larger than 5 GB, which sharing doesn't support yet.`);
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
  } catch {
    throw new ShareError("Couldn't upload the file to FrameJam Cloud.");
  }
  if (!res.ok) throw new ShareError(`Uploading to FrameJam Cloud failed (${res.status}).`);
  return bytes;
}

import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.ts";

/** Token from `framejam login`, kept under the data dir (respects FRAMEJAM_HOME). */
export interface AuthFile {
  token: string;
  cloudUrl?: string;
}

export function authPath(root: string = dataDir()): string {
  return path.join(root, "auth.json");
}

export function readAuth(root: string = dataDir()): AuthFile | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(authPath(root), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  try {
    const data = JSON.parse(raw) as Partial<AuthFile>;
    if (typeof data.token !== "string" || !data.token) return undefined;
    return {
      token: data.token,
      cloudUrl: typeof data.cloudUrl === "string" && data.cloudUrl ? data.cloudUrl : undefined,
    };
  } catch {
    return undefined;
  }
}

export function writeAuth(auth: AuthFile, root: string = dataDir()): void {
  fs.mkdirSync(root, { recursive: true });
  const file = authPath(root);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    // Windows.
  }
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows.
  }
}

/** Returns true when a file was removed. */
export function deleteAuth(root: string = dataDir()): boolean {
  try {
    fs.unlinkSync(authPath(root));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

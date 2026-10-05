import { env, packageRoot } from "./paths.ts";
import { VERSION, compareVersions } from "./version.ts";

export const UPDATE_COMMAND = "npx -y framejam@latest install";

export interface UpdateInfo {
  current: string;
  /** Newest version on npm, or null when it couldn't be checked. */
  latest: string | null;
  outdated: boolean;
  command: string;
}

const OK_TTL_MS = 6 * 60 * 60 * 1000;
const FAIL_TTL_MS = 30 * 60 * 1000;

/** Asks the npm registry for the newest published version. Null when offline or the answer isn't usable. */
export async function fetchLatestFromNpm(): Promise<string | null> {
  try {
    const res = await fetch("https://registry.npmjs.org/framejam/latest", {
      signal: AbortSignal.timeout(3000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const version = (await res.json()).version;
    return typeof version === "string" && /^\d+\.\d+\.\d+/.test(version) ? version : null;
  } catch {
    return null;
  }
}

/**
 * Tells the UI whether a newer version is on npm. Cached in memory, so it asks the registry at most every few hours.
 * Off for source checkouts (they aren't the published package) and when FRAMEJAM_NO_UPDATE_CHECK is set.
 */
export function createUpdateChecker(fetchLatest?: () => Promise<string | null>) {
  const installed = /[\\/]node_modules[\\/]/.test(packageRoot);
  const enabled = !env("NO_UPDATE_CHECK") && (Boolean(fetchLatest) || installed);
  const fetcher = fetchLatest ?? fetchLatestFromNpm;
  let cached: { latest: string | null; at: number } | undefined;

  return async (): Promise<UpdateInfo> => {
    const info = (latest: string | null): UpdateInfo => ({
      current: VERSION,
      latest,
      outdated: latest !== null && compareVersions(latest, VERSION) > 0,
      command: UPDATE_COMMAND,
    });
    if (!enabled) return info(null);
    const age = cached ? Date.now() - cached.at : Infinity;
    if (!cached || age > (cached.latest ? OK_TTL_MS : FAIL_TTL_MS)) cached = { latest: await fetcher(), at: Date.now() };
    return info(cached.latest);
  };
}

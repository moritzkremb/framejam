import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CoreContext, createMcpServer as createCoreMcpServer } from "../core/mcp.ts";
import type { ChooseSavePath } from "./save-dialog.ts";
import type { CatalogStatus } from "./catalog.ts";
import { createShareHooks, type ShareOptions } from "./share.ts";
import { currentSkillVersion } from "./skill.ts";
import { UPDATE_COMMAND } from "./update.ts";

/** The local app's context: the core one, minus what this computer fills in, plus options for the HTTP routes. */
export interface McpContext extends Omit<CoreContext, "skillVersion" | "updateCommand" | "share"> {
  /** Replaces the npm registry lookup behind the UI's "new version" notice (tests). */
  fetchLatestVersion?: () => Promise<string | null>;
  /** Where the save dialog for "Download video" starts, and where it saves without one. Defaults to Downloads (tests). */
  downloadsDir?: string;
  /** Replaces the system save dialog behind "Download video" (tests). */
  chooseSavePath?: ChooseSavePath;
  /** Folders checked for installed copies of the skill. Defaults to the global skill folders (tests). */
  skillDirs?: string[];
  /** The playbook catalog's state for `/api/catalog`. Absent means the catalog isn't set up (tests). */
  catalog?: () => CatalogStatus;
  /** Replaces how sharing reaches FrameJam Cloud (tests), or `false` to leave sharing off. */
  share?: ShareOptions | false;
}

/** The MCP server for this computer: the core tools with the installed skill's version. */
export function createMcpServer(ctx: McpContext): McpServer {
  const { share, ...rest } = ctx;
  return createCoreMcpServer({
    ...rest,
    skillVersion: currentSkillVersion(),
    updateCommand: UPDATE_COMMAND,
    share: share === false ? undefined : createShareHooks(ctx.store, share),
  });
}

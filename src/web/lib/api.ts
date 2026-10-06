import type { AgentInfo, PresetSummary, Review, ReviewComment, ReviewVersion, StoryboardPanel } from "../../shared/types";

export type { AgentInfo, PresetSummary, Review, ReviewComment, ReviewVersion, StoryboardPanel };

export interface ReviewListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  versions: number;
  latestVersion: number;
  latestSent: boolean;
  delivered: boolean;
  draftComments: number;
  agentListening: boolean;
  hasVideo: boolean;
  /** Panels in the latest version; 0 for videos. */
  panels: number;
}

export interface UpdateInfo {
  current: string;
  latest: string | null;
  outdated: boolean;
  command: string;
}

export interface Health {
  ok: boolean;
  app: string;
  version?: string;
  dataDir: string;
  baseUrl: string;
  agent: AgentInfo | null;
  setup?: { mcpCommand: string[]; installCommand?: string[]; skillPath: string };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  health: () => request<Health>("/api/health"),
  update: () => request<UpdateInfo>("/api/update"),
  reviews: () => request<ReviewListItem[]>("/api/reviews"),
  review: (id: string) => request<Review>(`/api/reviews/${id}`),
  addComment: (
    id: string,
    body: Partial<ReviewComment> & { text: string; time: number; thumbnailDataUrl?: string },
  ) => request<ReviewComment>(`/api/reviews/${id}/comments`, { method: "POST", body: JSON.stringify(body) }),
  updateComment: (id: string, cid: string, body: { text: string }) =>
    request<ReviewComment>(`/api/reviews/${id}/comments/${cid}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteComment: (id: string, cid: string) => request(`/api/reviews/${id}/comments/${cid}`, { method: "DELETE" }),
  submit: (id: string, message?: string) =>
    request<{ batch: { id: string; commentIds: string[] }; agentListening: boolean }>(`/api/reviews/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  reopen: (id: string) => request<{ wasDelivered: boolean; review: Review }>(`/api/reviews/${id}/reopen`, { method: "POST" }),
  downloadVideo: (id: string, version: number) =>
    request<{ path: string; chosen: boolean } | { cancelled: true }>(`/api/reviews/${id}/versions/${version}/download`, { method: "POST" }),
  prompt: (id: string, version?: number) => request<string>(`/api/reviews/${id}/prompt${version ? `?version=${version}` : ""}`),
  presets: () => request<{ selected: string | null; presets: PresetSummary[] }>("/api/presets"),
  preset: (id: string) =>
    request<{ preset: PresetSummary; selected: string | null; files: { path: string; content: string }[] }>(
      `/api/presets/${id}`,
    ),
  selectPreset: (id: string | null) =>
    request<{ id: string; selectedAt: string } | null>("/api/selected-preset", {
      method: "PUT",
      body: JSON.stringify({ id }),
    }),
};

export function videoUrl(reviewId: string, version: number) {
  return `/api/reviews/${reviewId}/versions/${version}/video`;
}

export function panelUrl(reviewId: string, version: number, panel: number) {
  return `/api/reviews/${reviewId}/versions/${version}/panels/${panel}`;
}
export function posterUrl(reviewId: string, version: number) {
  return `/api/reviews/${reviewId}/poster?v=${version}`;
}

/** Friendly name for the MCP client that connected ("claude-code" → "Claude Code"). */
export function agentLabel(agent: AgentInfo | null | undefined): string | undefined {
  if (!agent) return undefined;
  const n = agent.name.toLowerCase();
  if (n.includes("claude-code") || n === "claude code") return "Claude Code";
  if (n.includes("claude")) return "Claude";
  if (n.includes("cursor")) return "Cursor";
  if (n.includes("openai") || n.includes("chatgpt")) return "ChatGPT";
  if (n.includes("codex")) return "Codex";
  if (n.includes("vscode") || n.includes("copilot")) return "VS Code";
  return agent.name;
}

/** Copies text, with a fallback for embedded browsers that block the async clipboard API. */
/** What you paste into your agent chat when it wasn't listening for a finished review. */
export function handoffMessage(reviewId: string) {
  return `Apply my FrameJam feedback for ${reviewId}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("Clipboard is not available in this browser");
  }
}

export function thumbUrl(reviewId: string, file: string) {
  return `/api/reviews/${reviewId}/thumbs/${file}`;
}

/** 0:04.1 (precise) or 0:04. */
export function formatTime(seconds: number, precise = true) {
  const s = Math.max(0, seconds || 0);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return precise ? `${m}:${rest.toFixed(1).padStart(4, "0")}` : `${m}:${Math.floor(rest).toString().padStart(2, "0")}`;
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 172800) return "Yesterday";
  return new Date(iso).toLocaleDateString();
}

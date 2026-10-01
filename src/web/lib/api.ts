import type { ElementInfo, PresetSummary, Review, ReviewComment } from "../../shared/types";

export type { ElementInfo, PresetSummary, Review, ReviewComment };

export interface ReviewListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  versions: number;
  openComments: number;
  draftComments: number;
  resolvedComments: number;
  agentWaiting: boolean;
  hasVideo: boolean;
  hasComposition: boolean;
}

export interface Health {
  ok: boolean;
  app: string;
  dataDir: string;
  baseUrl: string;
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
  reviews: () => request<ReviewListItem[]>("/api/reviews"),
  review: (id: string) => request<Review>(`/api/reviews/${id}`),
  addComment: (
    id: string,
    body: Partial<ReviewComment> & { text: string; time: number; thumbnailDataUrl?: string },
  ) => request<ReviewComment>(`/api/reviews/${id}/comments`, { method: "POST", body: JSON.stringify(body) }),
  updateComment: (id: string, cid: string, body: { text?: string; status?: "draft" | "resolved" }) =>
    request<ReviewComment>(`/api/reviews/${id}/comments/${cid}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteComment: (id: string, cid: string) => request(`/api/reviews/${id}/comments/${cid}`, { method: "DELETE" }),
  submit: (id: string, message?: string) =>
    request<{ batch: { id: string; commentIds: string[] }; agentWaiting: boolean }>(`/api/reviews/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  prompt: (id: string) => request<string>(`/api/reviews/${id}/prompt`),
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

export function compositionUrl(reviewId: string, version: number) {
  return `/api/reviews/${reviewId}/versions/${version}/composition/`;
}

export function thumbUrl(reviewId: string, file: string) {
  return `/api/reviews/${reviewId}/thumbs/${file}`;
}

export function formatTime(seconds: number, precise = true) {
  const s = Math.max(0, seconds || 0);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return precise ? `${m}:${rest.toFixed(2).padStart(5, "0")}` : `${m}:${Math.floor(rest).toString().padStart(2, "0")}`;
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

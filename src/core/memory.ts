import { StoreError } from "./store.ts";
import type { Memory, MemoryScope, MemorySource } from "./types.ts";

/** At most this many memories go to the agent per call, so they stay hints and not a wall of text. */
export const MEMORY_LIMIT = 20;
export const MEMORY_MAX_LENGTH = 280;

export interface RememberInput {
  text: string;
  /** Default "me" for a new memory. */
  scope?: MemoryScope;
  /** Required for client memories. */
  client?: string;
  sources?: MemorySource[];
  /** The user asked for it in so many words, so it doesn't wait for a second project. */
  confident?: boolean;
  /** Update this memory (a rewording, or the same lesson seen again) instead of matching by text. */
  id?: string;
}

export function sameClient(a: string | undefined, b: string | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

const normalized = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!]+$/, "");

function mergeSources(a: MemorySource[], b: MemorySource[]) {
  const seen = new Set(a.map((s) => `${s.reviewId}/${s.commentId}`));
  return [...a, ...b.filter((s) => !seen.has(`${s.reviewId}/${s.commentId}`))];
}

/** Confident once the user asked for it or the lesson showed up in two projects; one project's notes are a hint. */
function confidenceOf(asked: boolean, sources: MemorySource[]): Memory["confidence"] {
  return asked || new Set(sources.map((s) => s.reviewId)).size >= 2 ? "confident" : "tentative";
}

/**
 * Adds a memory to the list, or folds it into the one it repeats (same scope, client and wording, or `id`). Returns
 * the new list, so a store only has to load and save it.
 */
export function applyRemember(
  list: Memory[],
  input: RememberInput,
  make: { id: () => string; now: string },
): { memories: Memory[]; memory: Memory; created: boolean } {
  const text = input.text.trim().replace(/\s+/g, " ");
  if (!text) throw new StoreError("A memory needs text");
  if (text.length > MEMORY_MAX_LENGTH) throw new StoreError(`Keep a memory to one short sentence (at most ${MEMORY_MAX_LENGTH} characters)`);

  const existing = input.id ? list.find((m) => m.id === input.id) : undefined;
  if (input.id && !existing) throw new StoreError(`No memory ${input.id}`, 404);
  const scope = input.scope ?? existing?.scope ?? "me";
  const client = scope === "client" ? (input.client ?? existing?.client)?.trim() || undefined : undefined;
  if (scope === "client" && !client) throw new StoreError("A client memory needs the client's name");

  const match =
    existing ?? list.find((m) => m.scope === scope && sameClient(m.client, client) && normalized(m.text) === normalized(text));
  if (match) {
    const sources = mergeSources(match.sources, input.sources ?? []);
    const memory: Memory = {
      ...match,
      scope,
      client,
      text: input.id ? text : match.text,
      sources,
      confidence: confidenceOf(match.confidence === "confident" || Boolean(input.confident), sources),
      updatedAt: make.now,
    };
    return { memories: list.map((m) => (m.id === match.id ? memory : m)), memory, created: false };
  }

  const sources = mergeSources([], input.sources ?? []);
  const memory: Memory = {
    id: make.id(),
    scope,
    ...(client ? { client } : {}),
    text,
    confidence: confidenceOf(Boolean(input.confident), sources),
    sources,
    createdAt: make.now,
    updatedAt: make.now,
  };
  return { memories: [memory, ...list], memory, created: true };
}

/** What applies to a video: the user's own memories plus the client's, confident first, newest first, capped. */
export function relevantMemories(list: Memory[], opts: { client?: string } = {}): Memory[] {
  return list
    .filter((m) => m.scope === "me" || (opts.client?.trim() && sameClient(m.client, opts.client)))
    .sort((a, b) => Number(b.confidence === "confident") - Number(a.confidence === "confident") || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MEMORY_LIMIT);
}

/** Every client with memories, A to Z. */
export function memoryClients(list: Memory[]): string[] {
  const names: string[] = [];
  for (const m of list) if (m.client && !names.some((n) => sameClient(n, m.client))) names.push(m.client);
  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

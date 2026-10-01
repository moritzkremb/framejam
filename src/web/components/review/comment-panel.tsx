import { Check, ClipboardCopy, Code2, Loader2, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatTime, thumbUrl, type ElementInfo, type ReviewComment } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface Draft {
  time: number;
  endTime?: number;
  x?: number;
  y?: number;
  element?: ElementInfo;
  thumbnailDataUrl?: string;
}

export function ElementChip({ element }: { element: ElementInfo }) {
  const tween = element.tweens[0];
  return (
    <div className="mt-2 rounded-md border bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
      <div className="flex items-center gap-1.5 text-foreground">
        <Code2 className="size-3 shrink-0 text-primary" />
        <span className="truncate">{element.selector}</span>
      </div>
      {element.text && <div className="truncate">“{element.text}”</div>}
      {tween && (
        <div className="truncate">
          {tween.relation === "active" ? "tween" : `${tween.relation} tween`}{" "}
          {Object.entries(tween.props)
            .slice(0, 3)
            .map(([k, v]) => `${k}:${v}`)
            .join(" ")}{" "}
          · {tween.start.toFixed(2)}–{tween.end.toFixed(2)}s{tween.ease ? ` · ${tween.ease}` : ""}
        </div>
      )}
    </div>
  );
}

export function Composer({
  draft,
  onCancel,
  onSubmit,
}: {
  draft: Draft;
  onCancel(): void;
  onSubmit(text: string, wholeVideo: boolean): Promise<void>;
}) {
  const [text, setText] = useState("");
  const [whole, setWhole] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [draft]);

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(text, whole);
      setText("");
      setWhole(false);
    } finally {
      setSaving(false);
    }
  };

  const label = whole
    ? "Whole video"
    : draft.endTime !== undefined
      ? `${formatTime(draft.time)} – ${formatTime(draft.endTime)}`
      : formatTime(draft.time);

  return (
    <div className="animate-in rounded-xl border border-primary/50 bg-card p-3 shadow-lg fade-in slide-in-from-top-1">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="secondary" className="font-mono tabular-nums">
          {label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {draft.x !== undefined ? "Pinned on frame" : draft.endTime !== undefined ? "Time range" : "At playhead"}
        </span>
        <Button variant="ghost" size="icon" className="ml-auto size-6" onClick={onCancel} aria-label="Cancel comment">
          <X className="size-3.5" />
        </Button>
      </div>
      {draft.thumbnailDataUrl && (
        <img src={draft.thumbnailDataUrl} alt="Captured frame" className="mb-2 aspect-video w-full rounded-md object-cover" />
      )}
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What should change here?"
        className="min-h-20 resize-none text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      {draft.element && <ElementChip element={draft.element} />}
      <div className="mt-2.5 flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={whole} onCheckedChange={setWhole} className="scale-90" />
          Applies to whole video
        </label>
        <Button size="sm" className="ml-auto gap-1.5" disabled={!text.trim() || saving} onClick={() => void submit()}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Add comment
          <kbd className="ml-1 hidden rounded bg-black/20 px-1 text-[10px] sm:inline">⌘↵</kbd>
        </Button>
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  index,
  reviewId,
  activeVersion,
  selected,
  onSelect,
  onUpdate,
  onDelete,
}: {
  comment: ReviewComment;
  index: number;
  reviewId: string;
  activeVersion: number;
  selected: boolean;
  onSelect(): void;
  onUpdate(patch: { text?: string; status?: "draft" | "resolved" }): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const at = comment.wholeVideo
    ? "Whole video"
    : comment.endTime !== undefined
      ? `${formatTime(comment.time)}–${formatTime(comment.endTime)}`
      : formatTime(comment.time);

  return (
    <li
      ref={ref}
      data-testid="comment-card"
      className={cn(
        "group rounded-xl border bg-card/60 p-3 transition-colors",
        selected ? "border-primary/70 bg-card" : "hover:border-white/20",
        comment.status === "resolved" && "opacity-75",
      )}
    >
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={onSelect}>
        <span
          className={cn(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
            comment.status === "resolved"
              ? "bg-emerald-500 text-emerald-950"
              : comment.status === "sent"
                ? "bg-sky-400 text-sky-950"
                : "bg-primary text-primary-foreground",
          )}
        >
          {comment.status === "resolved" ? <Check className="size-3.5" /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-foreground tabular-nums">{at}</span>
            {comment.version !== activeVersion && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                v{comment.version}
              </Badge>
            )}
            <Badge
              variant="secondary"
              className={cn(
                "h-4 px-1.5 text-[10px]",
                comment.status === "sent" && "bg-sky-400/15 text-sky-300",
                comment.status === "resolved" && "bg-emerald-500/15 text-emerald-300",
                comment.status === "draft" && "bg-primary/15 text-primary",
              )}
            >
              {comment.status === "draft" ? "Unsent" : comment.status === "sent" ? "With agent" : "Resolved"}
            </Badge>
          </div>
          {!editing && <p className="mt-1 text-sm leading-snug whitespace-pre-wrap">{comment.text}</p>}
        </div>
        {comment.thumbnail && (
          <img
            src={thumbUrl(reviewId, comment.thumbnail)}
            alt=""
            className="h-11 w-auto max-w-20 shrink-0 rounded object-cover ring-1 ring-white/10"
            loading="lazy"
          />
        )}
      </button>

      {editing && (
        <div className="mt-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-16 text-sm" autoFocus />
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await onUpdate({ text });
                setEditing(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {comment.element && !editing && <ElementChip element={comment.element} />}

      {comment.resolution && (
        <p className="mt-2 rounded-md bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-200">
          Fixed in v{comment.resolution.version}
          {comment.resolution.note ? ` — ${comment.resolution.note}` : ""}
        </p>
      )}

      {!editing && (
        <div className="mt-2 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          {comment.status !== "resolved" && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setEditing(true)}>
              <Pencil className="size-3" /> Edit
            </Button>
          )}
          {comment.status === "resolved" ? (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void onUpdate({ status: "draft" })}>
              <RotateCcw className="size-3" /> Reopen
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void onUpdate({ status: "resolved" })}>
              <Check className="size-3" /> Resolve
            </Button>
          )}
          {comment.status === "draft" && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => void onDelete()}
            >
              <Trash2 className="size-3" /> Delete
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export type CommentFilter = "open" | "resolved" | "all";

export function CommentPanel({
  reviewId,
  comments,
  indexOf,
  activeVersion,
  selectedId,
  filter,
  onFilter,
  agentWaiting,
  composer,
  onSelect,
  onUpdate,
  onDelete,
  onSend,
  onCopyPrompt,
}: {
  reviewId: string;
  comments: ReviewComment[];
  indexOf: (id: string) => number;
  activeVersion: number;
  selectedId: string | null;
  filter: CommentFilter;
  onFilter(f: CommentFilter): void;
  agentWaiting: boolean;
  composer: React.ReactNode;
  onSelect(c: ReviewComment): void;
  onUpdate(c: ReviewComment, patch: { text?: string; status?: "draft" | "resolved" }): Promise<void>;
  onDelete(c: ReviewComment): Promise<void>;
  onSend(message: string): Promise<boolean>;
  onCopyPrompt(): Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const counts = {
    open: comments.filter((c) => c.status !== "resolved").length,
    resolved: comments.filter((c) => c.status === "resolved").length,
    all: comments.length,
  };
  const drafts = comments.filter((c) => c.status === "draft").length;
  const visible = comments
    .filter((c) => (filter === "all" ? true : filter === "open" ? c.status !== "resolved" : c.status === "resolved"))
    .sort((a, b) => Number(!!b.wholeVideo) - Number(!!a.wholeVideo) || a.time - b.time);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-3">
        <Tabs value={filter} onValueChange={(v) => onFilter(v as CommentFilter)}>
          <TabsList className="h-8">
            <TabsTrigger value="open" className="text-xs">
              Open {counts.open}
            </TabsTrigger>
            <TabsTrigger value="resolved" className="text-xs">
              Resolved {counts.resolved}
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => void onCopyPrompt()}>
          <ClipboardCopy className="size-3.5" /> Copy as prompt
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-1 pb-3">
        {composer}
        {visible.length === 0 && !composer && (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {filter === "resolved" ? (
              "Nothing resolved yet. The agent checks comments off as it fixes them."
            ) : (
              <>
                <p className="font-medium text-foreground">No comments yet</p>
                <p className="mt-1">
                  Click anywhere on the frame to pin a note, press <kbd className="rounded bg-muted px-1">C</kbd> to comment at
                  the playhead, or drag on the timeline lane to mark a range.
                </p>
              </>
            )}
          </div>
        )}
        <ul className="space-y-2.5">
          {visible.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              index={indexOf(c.id)}
              reviewId={reviewId}
              activeVersion={activeVersion}
              selected={selectedId === c.id}
              onSelect={() => onSelect(c)}
              onUpdate={(patch) => onUpdate(c, patch)}
              onDelete={() => onDelete(c)}
            />
          ))}
        </ul>
      </div>

      <div className="border-t pt-3">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Optional note for the agent, e.g. “keep the music”"
          className="mb-2 h-8 text-sm"
        />
        <Button
          data-testid="send-to-agent"
          className="h-10 w-full gap-2 text-sm font-semibold"
          disabled={(drafts === 0 && !message.trim()) || sending}
          onClick={async () => {
            setSending(true);
            try {
              if (await onSend(message)) setMessage("");
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send to agent{drafts > 0 ? ` (${drafts})` : ""}
        </Button>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          {agentWaiting ? (
            <>
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Your agent is waiting — it gets these
              instantly.
            </>
          ) : (
            "Agent not listening right now — it gets these on its next wait_for_feedback or get_feedback call."
          )}
        </p>
      </div>
    </div>
  );
}

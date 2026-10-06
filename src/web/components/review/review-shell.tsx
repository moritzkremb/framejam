import { ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, Download, Keyboard, Loader2, MessageSquare, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BackHeader } from "@/components/header";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/menu";
import { CommentList } from "@/components/review/comment-list";
import { Handoff } from "@/components/review/dock";
import type { ReviewState } from "@/components/review/use-review";
import { api, copyText, relativeTime, videoUrl, type Review, type ReviewComment, type ReviewVersion } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Below this width the sidebar slides over the stage instead of taking a column. */
export const OVERLAY_BELOW = 720;

function readCollapsed() {
  try {
    return localStorage.getItem("framejam:sidebar") === "collapsed";
  } catch {
    return false;
  }
}

/** Open/closed state of the comments sidebar: remembered as a column, transient as an overlay. */
export function useSidebar(width: number) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const overlay = width > 0 && width < OVERLAY_BELOW;
  const open = overlay ? overlayOpen : !collapsed;
  const setOpen = (next: boolean) => {
    if (overlay) return setOverlayOpen(next);
    setCollapsed(!next);
    try {
      localStorage.setItem("framejam:sidebar", next ? "open" : "collapsed");
    } catch {
      /* private mode */
    }
  };
  return { overlay, open, setOpen };
}

export type SidebarState = ReturnType<typeof useSidebar>;

/** A label and the keys that trigger it, shown one key per chip. */
export type Shortcut = [label: string, keys: string[]];

/** Keyboard button that lists every shortcut; `?` opens it too. */
function ShortcutsButton({ shortcuts }: { shortcuts: Shortcut[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey || target?.closest?.("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="fc-btn ghost icon sm" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
          <Keyboard className="fc-i sm" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="fc-menu fc-shortcuts" align="end" sideOffset={6}>
          <div className="t">Keyboard shortcuts</div>
          <dl>
            {shortcuts.map(([label, keys]) => (
              <div key={label} className="row">
                <dt>{label}</dt>
                <dd>
                  {keys.map((k) => (
                    <kbd key={k} className="fc-kbd">
                      {k}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

/**
 * Saves a copy of a version's render where the user picks. Chromium browsers (Chrome, Edge, Cursor's built-in
 * browser) show their own save dialog; elsewhere the server opens the system's, or saves to Downloads without one.
 */
async function downloadVideo(review: Review, version: ReviewVersion) {
  const ext = version.videoPath?.match(/\.\w+$/)?.[0] ?? ".mp4";
  const suggestedName = `${review.title} v${version.number}`.replace(/[\\/:*?"<>|]+/g, "-").trim() || "video";
  const picker = (window as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  try {
    if (picker) {
      let handle: FileSystemFileHandle | undefined;
      try {
        handle = await picker({ suggestedName: suggestedName + ext, types: [{ description: "Video", accept: { "video/mp4": [ext] } }] });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        // The picker exists but isn't allowed here: let the server ask instead.
      }
      if (handle) {
        const res = await fetch(videoUrl(review.id, version.number));
        if (!res.ok || !res.body) throw new Error("Couldn't read the video");
        await res.body.pipeTo(await handle.createWritable());
        toast.success("Video saved", { description: handle.name });
        return;
      }
    }
    const saved = await api.downloadVideo(review.id, version.number);
    if ("cancelled" in saved) return;
    toast.success(saved.chosen ? "Video saved" : "Saved to Downloads", { description: saved.path });
  } catch (e) {
    toast.error((e as Error).message);
  }
}

/** Icon button beside Finish review that saves a copy of the version's video. */
export function DownloadButton({ review, version }: { review: Review; version: ReviewVersion }) {
  const [saving, setSaving] = useState(false);
  return (
    <button
      type="button"
      className="fc-btn outline icon"
      aria-label="Download video"
      title="Download this version's video"
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        await downloadVideo(review, version);
        setSaving(false);
      }}
      data-testid="download-video"
    >
      {saving ? <Loader2 className="fc-i sm fc-spin" /> : <Download className="fc-i sm" />}
    </button>
  );
}

export function ReviewHeader({
  r,
  subline,
  shortcuts,
  onPickVersion,
}: {
  r: ReviewState;
  subline: string;
  shortcuts: Shortcut[];
  onPickVersion(n: number): void;
}) {
  const { review, version, latest } = r;
  if (!review || !version || !latest) return null;
  return (
    <BackHeader to="/" title={review.title} sub={subline}>
      <ShortcutsButton shortcuts={shortcuts} />
      <Menu
        label="Versions and more"
        trigger={
          <button type="button" className="fc-btn sm" aria-label="Versions and more">
            v{version.number} <ChevronDown className="fc-i xs" />
          </button>
        }
      >
        <MenuLabel>Version</MenuLabel>
        {review.versions.map((v) => (
          <MenuItem
            key={v.number}
            checked={v.number === version.number}
            hint={v.number === latest.number ? "latest" : relativeTime(v.createdAt)}
            onSelect={() => onPickVersion(v.number)}
          >
            v{v.number}
            {v.note ? ` · ${v.note}` : ""}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          icon={<Copy className="fc-i sm" />}
          onSelect={async () => {
            try {
              await copyText(await api.prompt(review.id, version.number));
              toast.success("Comments copied as text", { description: "Paste them into any agent chat." });
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Copy comments as text
        </MenuItem>
        {version.videoPath && (
          <MenuItem icon={<Download className="fc-i sm" />} onSelect={() => void downloadVideo(review, version)}>
            Download video
          </MenuItem>
        )}
      </Menu>
    </BackHeader>
  );
}

/** Under the stage: the comment box while the round is open, the handoff once finished, or a bar on old versions. */
export function ReviewBottom({ r, comments, dock, onLatest }: { r: ReviewState; comments: ReviewComment[]; dock: ReactNode; onLatest(): void }) {
  const { review, version, isLatest, isOpen } = r;
  if (!review || !version) return null;
  if (!isLatest) {
    return (
      <div className="fc-oldbar">
        <Clock className="fc-i sm" />
        <span className="fc-grow">
          You're looking at <b>version {version.number}</b>.{" "}
          {version.sentAt ? `Its comments made version ${version.number + 1}.` : "Its review was never finished."}
        </span>
        <button type="button" className="fc-btn primary sm" onClick={onLatest}>
          Go to latest
        </button>
      </div>
    );
  }
  if (isOpen) return <>{dock}</>;
  const batch = version.batchId ? review.batches.find((b) => b.id === version.batchId) : undefined;
  return (
    <Handoff
      reviewId={review.id}
      delivered={Boolean(batch?.deliveredAt)}
      listening={Boolean(review.agentListening)}
      outdated={Boolean(review.agentOutdated)}
      autoCopied={r.autoCopied}
      count={comments.length}
      nextVersion={version.number + 1}
      onReopen={r.reopen}
    />
  );
}

export function ReviewSidebar({
  r,
  side,
  comments,
  selectedId,
  emptyState,
  label,
  onSelect,
}: {
  r: ReviewState;
  side: SidebarState;
  comments: ReviewComment[];
  selectedId: string | null;
  emptyState: ReactNode;
  label?(c: ReviewComment): string;
  onSelect(c: ReviewComment): void;
}) {
  if (!side.open) return null;
  return (
    <aside className={cn("fc-side", side.overlay && "overlay")} aria-label="Comments">
      <div className="fc-side-h">
        <span className="fc-h3">Comments</span>
        {comments.length > 0 && <span className={cn("fc-count", r.isOpen ? "draft" : "sent")}>{comments.length}</span>}
        <span className="fc-grow" />
        <button type="button" className="fc-btn ghost icon sm round" aria-label="Hide comments" onClick={() => side.setOpen(false)}>
          {side.overlay ? <X className="fc-i sm" /> : <ChevronRight className="fc-i sm" />}
        </button>
      </div>
      <div className="fc-side-body">
        {comments.length ? (
          <CommentList
            comments={comments}
            editable={r.isOpen}
            selectedId={selectedId}
            label={label}
            onSelect={onSelect}
            onSave={r.saveComment}
            onDelete={r.deleteComment}
          />
        ) : r.isOpen ? (
          emptyState
        ) : (
          <p className="fc-caption" style={{ padding: "4px 2px" }}>
            No comments on this version.
          </p>
        )}
      </div>
    </aside>
  );
}

export function CommentsRail({ side, count, open }: { side: SidebarState; count: number; open: boolean }) {
  return (
    <div className="fc-rail">
      <button type="button" className="fc-railbtn" aria-label="Show comments" onClick={() => side.setOpen(true)}>
        <ChevronLeft className="fc-i sm" />
      </button>
      <button type="button" className="fc-railbtn" aria-label={`${count} comments`} onClick={() => side.setOpen(true)}>
        <MessageSquare className="fc-i sm" />
        {count > 0 && <span className={cn("c", open ? "draft" : "sent")}>{count}</span>}
      </button>
    </div>
  );
}

import { ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, Keyboard, MessageSquare, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BackHeader } from "@/components/header";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/menu";
import { CommentList } from "@/components/review/comment-list";
import { Handoff } from "@/components/review/dock";
import type { ReviewState } from "@/components/review/use-review";
import { api, copyText, relativeTime, type ReviewComment } from "@/lib/api";
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

export function ReviewHeader({
  r,
  subline,
  shortcuts,
  onPickVersion,
}: {
  r: ReviewState;
  subline: string;
  shortcuts: string;
  onPickVersion(n: number): void;
}) {
  const { review, version, latest } = r;
  if (!review || !version || !latest) return null;
  return (
    <BackHeader to="/projects" title={review.title} sub={subline}>
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
        <MenuItem icon={<Keyboard className="fc-i sm" />} hint="?" onSelect={() => toast(shortcuts)}>
          Keyboard shortcuts
        </MenuItem>
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

import { Code2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Menu, MenuItem } from "@/components/menu";
import { formatTime, type ReviewComment } from "@/lib/api";
import { cn } from "@/lib/utils";

export function whenLabel(c: Pick<ReviewComment, "wholeVideo" | "time" | "endTime">) {
  if (c.wholeVideo) return "Whole video";
  return c.endTime !== undefined ? `${formatTime(c.time)} – ${formatTime(c.endTime)}` : formatTime(c.time);
}

function elementLine(c: ReviewComment) {
  const el = c.element;
  if (!el) return null;
  const tween = el.tweens[0];
  const props = tween
    ? Object.entries(tween.props)
        .slice(0, 2)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")
    : "";
  return [el.selector, props, tween?.ease].filter(Boolean).join(" · ");
}

function CommentItem({
  comment,
  index,
  editable,
  selected,
  onSelect,
  onSave,
  onDelete,
}: {
  comment: ReviewComment;
  index: number;
  editable: boolean;
  selected: boolean;
  onSelect(): void;
  onSave(text: string): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  const ctx = elementLine(comment);

  return (
    <li
      ref={ref}
      data-testid="comment-card"
      className={cn("fc-item", !editable && "is-sent", selected && "is-active")}
      onClick={() => !editing && onSelect()}
    >
      <span className={cn("fc-num", editable ? "draft" : "sent")}>{index}</span>
      <div style={{ minWidth: 0 }}>
        <div className="top">
          <span className="when">{whenLabel(comment)}</span>
        </div>
        {editing ? (
          <div className="fc-edit" onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) {
                    await onSave(text);
                    setEditing(false);
                  }
                }
                if (e.key === "Escape") {
                  setText(comment.text);
                  setEditing(false);
                }
              }}
            />
            <div className="fc-row" style={{ justifyContent: "flex-end", gap: 4 }}>
              <button
                type="button"
                className="fc-btn ghost sm"
                onClick={() => {
                  setText(comment.text);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fc-btn sm"
                disabled={!text.trim()}
                onClick={async () => {
                  await onSave(text);
                  setEditing(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="body">{comment.text}</p>
        )}
        {ctx && (
          <div className="ctx" title={ctx}>
            <Code2 className="fc-i xs" /> <span className="fc-truncate">{ctx}</span>
          </div>
        )}
      </div>
      {editable && !editing ? (
        <span onClick={(e) => e.stopPropagation()}>
          <Menu
            label="Comment actions"
            trigger={
              <button type="button" className="fc-btn ghost icon sm round" aria-label="Comment actions">
                <MoreHorizontal className="fc-i sm" />
              </button>
            }
          >
            <MenuItem icon={<Pencil className="fc-i sm" />} onSelect={() => setEditing(true)}>
              Edit
            </MenuItem>
            <MenuItem danger icon={<Trash2 className="fc-i sm" />} onSelect={() => void onDelete()}>
              Delete
            </MenuItem>
          </Menu>
        </span>
      ) : (
        <span />
      )}
    </li>
  );
}

/** The comments on the version you're watching. Editable while the version is open, greyed once sent. */
export function CommentList({
  comments,
  editable,
  selectedId,
  onSelect,
  onSave,
  onDelete,
}: {
  comments: ReviewComment[];
  editable: boolean;
  selectedId: string | null;
  onSelect(c: ReviewComment): void;
  onSave(c: ReviewComment, text: string): Promise<void>;
  onDelete(c: ReviewComment): Promise<void>;
}) {
  return (
    <ul className="fc-thread compact">
      {comments.map((c, i) => (
        <CommentItem
          key={c.id}
          comment={c}
          index={i + 1}
          editable={editable}
          selected={selectedId === c.id}
          onSelect={() => onSelect(c)}
          onSave={(t) => onSave(c, t)}
          onDelete={() => onDelete(c)}
        />
      ))}
    </ul>
  );
}

import { Check, Mic, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, MenuItem } from "@/components/menu";
import { splitTranscript } from "../../../core/voice";
import { formatTime, type ReviewComment } from "@/lib/api";
import { elementLabel } from "@/lib/live-preview";
import { cn } from "@/lib/utils";

export function whenLabel(c: Pick<ReviewComment, "wholeVideo" | "time" | "endTime">) {
  if (c.wholeVideo) return "Whole video";
  return c.endTime !== undefined ? `${formatTime(c.time)} – ${formatTime(c.endTime)}` : formatTime(c.time);
}

/** A spoken comment: the transcript with each pointing phrase as a link to the frame that was shown, and the recording. */
function VoiceBody({ comment, frameUrl, onPoint }: { comment: ReviewComment; frameUrl?(file: string): string; onPoint?(point: number): void }) {
  const voice = comment.voice!;
  const [open, setOpen] = useState<number | null>(null);
  const transcribed = voice.status === "transcribed" && comment.text.trim();
  const point = open === null ? undefined : voice.points[open];
  const image = point?.frame ? (frameUrl ? frameUrl(point.frame) : point.frame) : undefined;
  return (
    <div className="fc-voice">
      {transcribed ? (
        <p className="body" data-testid="voice-transcript">
          {splitTranscript(comment.text, voice.points).map((piece, i) =>
            piece.point === undefined ? (
              <span key={i}>{piece.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                className={cn("fc-point", open === piece.point && "on")}
                aria-pressed={open === piece.point}
                data-testid="voice-point"
                title={`Show the frame for “${piece.text}”`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(open === piece.point ? null : piece.point!);
                  onPoint?.(piece.point!);
                }}
              >
                {piece.text}
              </button>
            ),
          )}
        </p>
      ) : (
        <p className="body fc-voice-note" data-testid="voice-note">
          {voice.note ?? "No transcript"}
        </p>
      )}
      {point && (
        <figure className="fc-point-frame" data-testid="voice-frame">
          {image ? <img src={image} alt={`The frame when “${point.phrase}” was said`} /> : <div className="none">No frame</div>}
          <figcaption>
            “{point.phrase}” at {formatTime(point.time)}
            {point.drawn ? " · drawn on" : ""}
          </figcaption>
        </figure>
      )}
      {voice.audioUrl && <audio className="fc-voice-audio" controls preload="none" src={voice.audioUrl} data-testid="voice-audio" onClick={(e) => e.stopPropagation()} />}
    </div>
  );
}

function CommentItem({
  comment,
  index,
  label,
  editable,
  selected,
  onSelect,
  onSave,
  onDelete,
  frameUrl,
  onPoint,
  footer,
}: {
  comment: ReviewComment;
  frameUrl?(file: string): string;
  onPoint?(point: number): void;
  footer?: CommentFooter;
  index: number;
  label: string;
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
          {comment.author && (
            <span className="who fc-truncate" title={`Written by ${comment.author} on the shared link`}>
              {comment.author}
            </span>
          )}
          {comment.voice && <Mic className="fc-i xs fc-voice-i" aria-label="Voice comment" />}
          <span className="when">{label}</span>
          {comment.fromVersion !== undefined && <span className="from">from v{comment.fromVersion}</span>}
          {comment.source === "live" && (
            <span className="from fc-truncate" title={comment.element ? `On the live preview, on ${comment.element.selector}` : "On the live preview"}>
              live{comment.element ? ` · ${elementLabel(comment.element)}` : ""}
            </span>
          )}
          {comment.status === "resolved" && comment.resolution && (
            <span className="res" data-testid="resolved-in" title={comment.resolution.note || undefined}>
              <Check className="fc-i xs" /> Resolved in v{comment.resolution.version}
            </span>
          )}
        </div>
        {comment.voice ? (
          <VoiceBody comment={comment} frameUrl={frameUrl} onPoint={onPoint} />
        ) : editing ? (
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
          comment.text && <p className="body">{comment.text}</p>
        )}
        {!editing && footer?.(comment, { edit: () => setEditing(true) })}
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
            {!comment.voice && (
              <MenuItem icon={<Pencil className="fc-i sm" />} onSelect={() => setEditing(true)}>
                Edit
              </MenuItem>
            )}
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

/** Extra content under a comment's text; `edit` opens its editor. */
export type CommentFooter = (comment: ReviewComment, actions: { edit(): void }) => ReactNode;

/**
 * The comments on the version you're watching, one card under another. Editable while the version is open, greyed
 * once finished; `editable` can also decide per comment (on a shared link, only your own unsent ones).
 */
export function CommentList({
  comments,
  editable,
  selectedId,
  label = whenLabel,
  onSelect,
  onSave,
  onDelete,
  frameUrl,
  onPoint,
  footer,
}: {
  footer?: CommentFooter;
  /** Turns a voice point's frame into an image URL; omit when frames already are URLs. */
  frameUrl?(file: string): string;
  /** A pointing phrase was clicked: seek to where it was said. */
  onPoint?(c: ReviewComment, point: number): void;
  comments: ReviewComment[];
  editable: boolean | ((c: ReviewComment) => boolean);
  selectedId: string | null;
  /** Where the comment is, e.g. "0:04.2" or "Panel 3". */
  label?(c: ReviewComment): string;
  onSelect(c: ReviewComment): void;
  onSave(c: ReviewComment, text: string): Promise<void>;
  onDelete(c: ReviewComment): Promise<void>;
}) {
  return (
    <ul className="fc-thread cards">
      {comments.map((c, i) => (
        <CommentItem
          key={c.id}
          comment={c}
          index={i + 1}
          label={label(c)}
          editable={typeof editable === "function" ? editable(c) : editable}
          selected={selectedId === c.id}
          onSelect={() => onSelect(c)}
          onSave={(t) => onSave(c, t)}
          onDelete={() => onDelete(c)}
          frameUrl={frameUrl}
          onPoint={onPoint && ((i) => onPoint(c, i))}
          footer={footer}
        />
      ))}
    </ul>
  );
}

import { Check, CheckCheck, Clock, Copy, Loader2, MapPin, MoveHorizontal, Pencil, X } from "lucide-react";
import { forwardRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { copyText, formatTime, type ElementInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Anchor =
  | { kind: "time" }
  | { kind: "spot"; time: number; x: number; y: number; element?: ElementInfo; thumbnailDataUrl?: string }
  | { kind: "range"; time: number; endTime: number };

function elementName(el?: ElementInfo) {
  if (!el) return "this spot";
  if (el.text) return `“${el.text.length > 22 ? `${el.text.slice(0, 21)}…` : el.text}”`;
  return el.selector.split(/\s*>\s*/).pop() ?? el.selector;
}

export function AgentLine({ listening, className }: { listening: boolean; className?: string }) {
  return (
    <span
      className={cn("fc-agent fc-grow", listening && "waiting", className)}
      title={
        listening
          ? "Your agent is waiting in Frame Jam. It gets your comments the moment you finish."
          : "Your agent isn't waiting in Frame Jam right now. After you finish, you'll get one line to paste into your chat."
      }
    >
      <span className="dot" />
      <span className="fc-truncate">{listening ? "Agent listening · starts when you finish" : "Agent not listening · you'll paste one line after"}</span>
    </span>
  );
}

interface DockProps {
  anchor: Anchor;
  whole: boolean;
  time: number;
  text: string;
  draftCount: number;
  agentListening: boolean;
  finishing: boolean;
  adding: boolean;
  onText(t: string): void;
  onClearAnchor(): void;
  onWhole(on: boolean): void;
  onAdd(): void;
  onFinish(): void;
  /** Storyboards: replaces the time-based chip and placeholder. */
  chip?: ReactNode;
  placeholder?: string;
  /** "Whole video" or "Whole storyboard". */
  wholeLabel?: string;
}

/** The comment box under the timeline, with Finish review beside the agent status. */
export const FeedbackDock = forwardRef<HTMLTextAreaElement, DockProps>(function FeedbackDock(
  {
    anchor,
    whole,
    time,
    text,
    draftCount,
    agentListening,
    finishing,
    adding,
    onText,
    onClearAnchor,
    onWhole,
    onAdd,
    onFinish,
    chip: customChip,
    placeholder: customPlaceholder,
    wholeLabel = "Whole video",
  },
  ref,
) {
  const chip = whole ? (
    <span className="fc-anchor plain">
      {wholeLabel}
      <button type="button" className="x" aria-label={`Not the ${wholeLabel.toLowerCase()}: comment on one part instead`} onClick={() => onWhole(false)}>
        <X className="fc-i xs" />
      </button>
    </span>
  ) : customChip ? (
    customChip
  ) : anchor.kind === "spot" ? (
    <span className="fc-anchor">
      <MapPin className="fc-i xs" /> {formatTime(anchor.time)} · on {elementName(anchor.element)}
      <button type="button" className="x" aria-label="Remove spot" onClick={onClearAnchor}>
        <X className="fc-i xs" />
      </button>
    </span>
  ) : anchor.kind === "range" ? (
    <span className="fc-anchor">
      <MoveHorizontal className="fc-i xs" /> {formatTime(anchor.time)} – {formatTime(anchor.endTime)}
      <button type="button" className="x" aria-label="Remove range" onClick={onClearAnchor}>
        <X className="fc-i xs" />
      </button>
    </span>
  ) : (
    <span className="fc-anchor plain">
      <Clock className="fc-i xs" /> At {formatTime(time)}
    </span>
  );

  const placeholder = whole
    ? `What should change in the ${wholeLabel.toLowerCase()}?`
    : customPlaceholder
      ? customPlaceholder
      : anchor.kind === "time" ? (draftCount ? "Add another comment…" : "Pause anywhere and type what should change…") : "What should change here?";

  return (
    <div className="fc-dock">
      <div className="box">
        <div className="tools">
          {chip}
          <span className="fc-grow" />
          {!whole && (
            <button type="button" className="fc-btn ghost sm fc-chip-btn" onClick={() => onWhole(true)}>
              {wholeLabel}
            </button>
          )}
        </div>
        <div className="entry">
          <textarea
            ref={ref}
            value={text}
            placeholder={placeholder}
            rows={1}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) onAdd();
              }
              if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
            }}
          />
          <button type="button" className="fc-btn sm" onClick={onAdd} disabled={adding || !text.trim()} title="Add comment (Enter)">
            Add <span className="fc-kbd">↵</span>
          </button>
        </div>
      </div>
      <div className="send">
        <AgentLine listening={agentListening} />
        <button
          type="button"
          data-testid="send-to-agent"
          className="fc-btn primary"
          onClick={onFinish}
          disabled={finishing || draftCount === 0}
          title={draftCount ? "Lock this version's comments and hand them to your agent. You can still reopen them." : "Add a comment first"}
        >
          {finishing ? <Loader2 className="fc-i sm fc-spin" /> : <CheckCheck className="fc-i sm" />}
          Finish review{draftCount ? ` · ${draftCount}` : ""}
        </button>
      </div>
    </div>
  );
});

interface HandoffProps {
  reviewId: string;
  delivered: boolean;
  listening: boolean;
  count: number;
  nextVersion: number;
  onReopen(): Promise<void>;
}

/** Replaces the comment box once a review is finished: says whether the agent has it, and lets you reopen it. */
export function Handoff({ reviewId, delivered, listening, count, nextVersion, onReopen }: HandoffProps) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reopening, setReopening] = useState(false);
  const message = `Apply my Frame Jam feedback for ${reviewId}`;
  const comments = `${count} comment${count === 1 ? "" : "s"}`;

  const reopen = async () => {
    setReopening(true);
    try {
      await onReopen();
    } finally {
      setReopening(false);
      setConfirming(false);
    }
  };

  const editButton = (
    <button
      type="button"
      className="fc-btn ghost sm"
      disabled={reopening}
      onClick={() => (delivered ? setConfirming(true) : void reopen())}
      data-testid="reopen-review"
    >
      {reopening ? <Loader2 className="fc-i xs fc-spin" /> : <Pencil className="fc-i xs" />}
      Edit comments
    </button>
  );

  if (confirming) {
    return (
      <div className="fc-dock">
        <div className="fc-handoff">
          <div className="hd">
            <span className="ic wait">
              <Pencil className="fc-i sm" />
            </span>
            <div className="fc-grow">
              <div className="t">Change your comments?</div>
              <div className="d">Your agent already started on these. When you finish again, it gets the new list and drops the old one.</div>
            </div>
          </div>
          <div className="fc-row" style={{ justifyContent: "flex-end", gap: 6 }}>
            <button type="button" className="fc-btn ghost sm" onClick={() => setConfirming(false)}>
              Keep them
            </button>
            <button type="button" className="fc-btn primary sm" disabled={reopening} onClick={() => void reopen()}>
              {reopening && <Loader2 className="fc-i xs fc-spin" />} Reopen review
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fc-dock">
      {delivered ? (
        <div className="fc-handoff" data-testid="handoff">
          <div className="hd">
            <span className="ic ok">
              <Check className="fc-i sm" />
            </span>
            <div className="fc-grow">
              <div className="t">Your agent is making version {nextVersion}</div>
              <div className="d">It has your {comments}. This page switches to version {nextVersion} when it's ready.</div>
            </div>
            {editButton}
          </div>
        </div>
      ) : listening ? (
        <div className="fc-handoff" data-testid="handoff">
          <div className="hd">
            <span className="ic ok">
              <Loader2 className="fc-i sm fc-spin" />
            </span>
            <div className="fc-grow">
              <div className="t">Handing your {comments} to your agent…</div>
              <div className="d">Your agent is listening, so this takes a second.</div>
            </div>
            {editButton}
          </div>
        </div>
      ) : (
        <div className="fc-handoff warn" data-testid="handoff">
          <div className="hd">
            <span className="ic wait">
              <CheckCheck className="fc-i sm" />
            </span>
            <div className="fc-grow">
              <div className="t">Review finished. Now tell your agent.</div>
              <div className="d">Your agent isn't listening right now. Paste this into your chat and it picks up your {comments}:</div>
            </div>
            {editButton}
          </div>
          <div className="fc-code">
            <code>{message}</code>
            <button
              type="button"
              className="fc-btn primary sm"
              onClick={async () => {
                try {
                  await copyText(message);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {copied ? <Check className="fc-i xs" /> : <Copy className="fc-i xs" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

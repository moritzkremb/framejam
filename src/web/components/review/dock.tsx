import { Check, CheckCheck, Clock, Copy, Loader2, MapPin, MoveHorizontal, Pencil, X } from "lucide-react";
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { copyText, formatTime, handoffMessage, type ElementInfo } from "@/lib/api";
import { cn, COPY_KEYS, FINISH_KEYS } from "@/lib/utils";

export type Anchor =
  | { kind: "time" }
  | { kind: "spot"; time: number; x: number; y: number; element?: ElementInfo; thumbnailDataUrl?: string }
  | { kind: "range"; time: number; endTime: number };

function elementName(el?: ElementInfo) {
  if (!el) return "this spot";
  if (el.text) return `“${el.text.length > 22 ? `${el.text.slice(0, 21)}…` : el.text}”`;
  return el.selector.split(/\s*>\s*/).pop() ?? el.selector;
}

const OUTDATED_HELP =
  "Your agent is running FrameJam from before the last update, so this page can't tell whether it's listening. Restart the framejam MCP server in your agent (Cursor: Settings → MCP) to fix it.";

export function AgentLine({ listening, outdated, className }: { listening: boolean; outdated?: boolean; className?: string }) {
  if (outdated && !listening) {
    return (
      <span className={cn("fc-agent fc-grow outdated", className)} title={OUTDATED_HELP}>
        <span className="dot" />
        <span className="fc-truncate">Agent needs a restart to show if it's listening</span>
      </span>
    );
  }
  return (
    <span
      className={cn("fc-agent fc-grow", listening && "waiting", className)}
      title={
        listening
          ? "Your agent is waiting in FrameJam. It gets your comments the moment you finish."
          : "Your agent isn't waiting in FrameJam right now. After you finish, you'll get one line to paste into your chat."
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
  agentOutdated?: boolean;
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
    agentOutdated,
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

  const canFinish = !finishing && (draftCount > 0 || text.trim().length > 0);
  const finishRef = useRef(() => {});
  useLayoutEffect(() => {
    finishRef.current = () => {
      if (canFinish) onFinish();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.repeat) return;
      e.preventDefault();
      finishRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                if (text.trim()) onAdd();
              }
              if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
            }}
          />
          <button type="button" className="fc-btn sm" onClick={onAdd} disabled={adding || !text.trim()} title="Add comment (Enter)">
            Add <span className="fc-kbd">↩</span>
          </button>
        </div>
      </div>
      <div className="send">
        <AgentLine listening={agentListening} outdated={agentOutdated} />
        <button
          type="button"
          data-testid="send-to-agent"
          className="fc-btn primary"
          onClick={onFinish}
          disabled={!canFinish}
          title={canFinish ? `Lock this version's comments and hand them to your agent (${FINISH_KEYS}). You can still reopen them.` : "Add a comment first"}
        >
          {finishing ? <Loader2 className="fc-i sm fc-spin" /> : <CheckCheck className="fc-i sm" />}
          Finish review{draftCount ? ` · ${draftCount}` : ""}
          <span className="fc-kbd">{FINISH_KEYS}</span>
        </button>
      </div>
    </div>
  );
});

interface HandoffProps {
  reviewId: string;
  delivered: boolean;
  listening: boolean;
  outdated?: boolean;
  /** The line below was already put on the clipboard when the review was finished. */
  autoCopied?: boolean;
  count: number;
  nextVersion: number;
  onReopen(): Promise<void>;
}

/** Replaces the comment box once a review is finished: says whether the agent has it, and lets you reopen it. */
export function Handoff({ reviewId, delivered, listening, outdated, autoCopied, count, nextVersion, onReopen }: HandoffProps) {
  // `copies` counts copies (including the automatic one on finish) so each restarts the "Copied" flash.
  const [copies, setCopies] = useState(autoCopied ? 1 : 0);
  const [copied, setCopied] = useState(Boolean(autoCopied));
  const [confirming, setConfirming] = useState(false);
  const [reopening, setReopening] = useState(false);
  const message = handoffMessage(reviewId);
  const comments = `${count} comment${count === 1 ? "" : "s"}`;
  const needsPaste = !delivered && !listening && !confirming;

  useEffect(() => {
    if (!copies) return;
    const t = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(t);
  }, [copies]);

  const copy = async () => {
    try {
      await copyText(message);
      setCopied(true);
      setCopies((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const copyRef = useRef(copy);
  useLayoutEffect(() => {
    copyRef.current = copy;
  });
  useEffect(() => {
    if (!needsPaste) return;
    // Cmd/Ctrl+C copies the line only when nothing else would be copied: no selected text, not in a field.
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "c" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (window.getSelection()?.toString()) return;
      if ((document.activeElement as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      void copyRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [needsPaste]);

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
              <div className="t">{autoCopied ? "Copied. Paste it into your agent chat." : "Review finished. Now tell your agent."}</div>
              <div className="d">
                {outdated
                  ? `If your agent was waiting, it picks these up on its own. Otherwise, paste this into your chat for your ${comments}:`
                  : autoCopied
                    ? `Your agent wasn't listening, so this line is on your clipboard. Pasting it hands over your ${comments}:`
                    : `Your agent isn't listening right now. Paste this into your chat and it picks up your ${comments}:`}
              </div>
              {outdated && <div className="d fc-t3" title={OUTDATED_HELP}>Restart the framejam MCP server so this page can see when your agent is listening.</div>}
            </div>
            {editButton}
          </div>
          <div className="fc-code">
            <code>{message}</code>
            <button type="button" className="fc-btn primary sm" onClick={() => void copy()} title={`Copy (${COPY_KEYS})`}>
              {copied ? <Check className="fc-i xs" /> : <Copy className="fc-i xs" />} {copied ? "Copied to clipboard" : "Copy"}
              {!copied && <span className="fc-kbd">{COPY_KEYS}</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { Check, Clock, Copy, Loader2, MapPin, MoveHorizontal, Send, X } from "lucide-react";
import { forwardRef, useState } from "react";
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

export function AgentLine({ waiting, className }: { waiting: boolean; className?: string }) {
  return (
    <span className={cn("fc-agent fc-grow", waiting && "waiting", className)}>
      <span className="dot" />
      <span className="fc-truncate">{waiting ? "Your agent is listening" : "Agent not listening · we'll show you what to tell it"}</span>
    </span>
  );
}

interface DockProps {
  anchor: Anchor;
  whole: boolean;
  time: number;
  text: string;
  draftCount: number;
  agentWaiting: boolean;
  sending: boolean;
  adding: boolean;
  onText(t: string): void;
  onClearAnchor(): void;
  onWhole(on: boolean): void;
  onAdd(): void;
  onSend(): void;
}

/** The chat-style comment box pinned to the bottom of a review, with Send right under it. */
export const FeedbackDock = forwardRef<HTMLTextAreaElement, DockProps>(function FeedbackDock(
  { anchor, whole, time, text, draftCount, agentWaiting, sending, adding, onText, onClearAnchor, onWhole, onAdd, onSend },
  ref,
) {
  const chip = whole ? (
    <span className="fc-anchor plain">
      Whole video
      <button type="button" className="x" aria-label="Attach to the current time instead" onClick={() => onWhole(false)}>
        <X className="fc-i xs" />
      </button>
    </span>
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

  const placeholder = draftCount ? "Add another comment…" : anchor.kind === "time" && !whole ? "Pause anywhere and type what should change…" : "What should change here?";

  return (
    <div className="fc-dock">
      <div className="box">
        <div className="tools">
          {chip}
          <span className="fc-grow" />
          {!whole && (
            <button type="button" className="fc-btn ghost sm fc-chip-btn" onClick={() => onWhole(true)}>
              Whole video
            </button>
          )}
        </div>
        <textarea
          ref={ref}
          value={text}
          placeholder={placeholder}
          rows={1}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (text.trim()) onAdd();
              else if (draftCount) onSend();
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) onAdd();
            }
            if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
          }}
        />
        {text.trim() && (
          <div className="tools">
            <span className="fc-caption">Enter to add · Shift+Enter for a new line</span>
            <span className="fc-grow" />
            <button type="button" className="fc-btn sm" onClick={onAdd} disabled={adding}>
              Add <span className="fc-kbd">↵</span>
            </button>
          </div>
        )}
      </div>
      <div className="send">
        <AgentLine waiting={agentWaiting} />
        {draftCount > 0 && (
          <button type="button" data-testid="send-to-agent" className="fc-btn primary lg" onClick={onSend} disabled={sending}>
            {sending ? <Loader2 className="fc-i sm fc-spin" /> : <Send className="fc-i sm" />}
            Send {draftCount} to agent
          </button>
        )}
      </div>
    </div>
  );
});

/** Replaces the comment box once a version is sent: says whether the agent got it, and what to do if not. */
export function Handoff({ reviewId, delivered, nextVersion }: { reviewId: string; delivered: boolean; nextVersion: number }) {
  const [copied, setCopied] = useState(false);
  const message = `Apply my Frame Jam feedback for ${reviewId}`;
  return (
    <div className="fc-dock">
      {delivered ? (
        <div className="fc-handoff" data-testid="handoff">
          <div className="hd">
            <span className="ic ok">
              <Check className="fc-i sm" />
            </span>
            <div>
              <div className="t">Your agent is making version {nextVersion}</div>
              <div className="d">It has your comments. This page switches to version {nextVersion} when it's ready.</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="fc-handoff warn" data-testid="handoff">
          <div className="hd">
            <span className="ic wait">
              <Send className="fc-i sm" />
            </span>
            <div>
              <div className="t">Sent. Now tell your agent.</div>
              <div className="d">Your agent isn't listening right now. Paste this into your chat so it picks up your comments:</div>
            </div>
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

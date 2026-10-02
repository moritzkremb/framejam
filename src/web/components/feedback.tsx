import { Check, Loader2, MessageSquare } from "lucide-react";
import { Popover } from "radix-ui";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { FINISH_KEYS } from "@/lib/utils";

declare const __APP_VERSION__: string;

/** The site forwards this to the maker's Discord; the webhook URL stays on the server. */
const FEEDBACK_ENDPOINT = "https://www.framejam.ai/api/feedback";
const EMAIL_KEY = "framejam:feedback-email";
const UPDATES_EMAIL_KEY = "framejam:updates-email";

function storedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? localStorage.getItem(UPDATES_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/** Header button that sends a short note straight to the maker of Frame Jam. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(storedEmail);
  const [company, setCompany] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const { pathname } = useLocation();

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!message.trim() || state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, email: email.trim() || undefined, page: pathname, version: __APP_VERSION__, company }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setState({ kind: "error", message: data.error || "That didn't go through. Try again in a minute." });
        return;
      }
      try {
        if (email.trim()) localStorage.setItem(EMAIL_KEY, email.trim());
      } catch {
        // Storage can be off in private windows; the email just isn't remembered.
      }
      setMessage("");
      setState({ kind: "sent" });
    } catch {
      setState({ kind: "error", message: "Couldn't reach framejam.ai. Check your connection and try again." });
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
  }

  const sending = state.kind === "sending";
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && state.kind !== "sending") setState({ kind: "idle" });
      }}
    >
      <Popover.Trigger asChild>
        <button type="button" className="fc-btn ghost sm fc-feedback-trigger" aria-label="Send feedback">
          <MessageSquare className="fc-i sm" />
          <span className="lbl">Feedback</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="fc-menu fc-feedback" align="end" sideOffset={6}>
          {state.kind === "sent" ? (
            <div className="fc-feedback-done" role="status">
              <Check className="fc-i" />
              <div>
                <div className="t">Thanks, it's on its way</div>
                <p className="fc-caption">Moritz reads every message{email.trim() ? " and may reply by email" : ""}.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={send}>
              <div className="t">Send feedback</div>
              <p className="fc-caption">Goes straight to Moritz, who makes Frame Jam. Bugs, ideas, anything.</p>
              <textarea
                className="fc-input"
                aria-label="Your feedback"
                placeholder="What's working, what's not…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={3000}
                disabled={sending}
                autoFocus
              />
              <input
                className="fc-input"
                type="email"
                aria-label="Your email (optional)"
                placeholder="Email, if you'd like a reply"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={sending}
              />
              <input className="fc-hp" tabIndex={-1} autoComplete="off" aria-hidden value={company} onChange={(e) => setCompany(e.target.value)} />
              {state.kind === "error" && (
                <p className="fc-caption err" role="alert">
                  {state.message}
                </p>
              )}
              <button type="submit" className="fc-btn primary sm" disabled={!message.trim() || sending}>
                {sending && <Loader2 className="fc-i sm fc-spin" />}
                Send
                <span className="fc-kbd">{FINISH_KEYS}</span>
              </button>
            </form>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

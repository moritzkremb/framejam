import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

export const COMMUNITY_URL = "https://www.skool.com/promptwarrior";
const UPDATES_ENDPOINT = "https://www.framejam.ai/api/waitlist";
const SUBSCRIBED_KEY = "framejam:updates-email";
function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the signup form simply shows again next time.
  }
}

type FormState = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string };

/** Email signup for Frame Jam news. Posts to the website, which stores it with the site's signups. */
export function UpdatesForm({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(() => readStorage(SUBSCRIBED_KEY));
  const [state, setState] = useState<FormState>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setState({ kind: "sending" });
    try {
      const res = await fetch(UPDATES_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value, source }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setState({ kind: "error", message: data.error || "That didn't go through. Try again in a minute." });
        return;
      }
      writeStorage(SUBSCRIBED_KEY, value);
      setSubscribed(value);
    } catch {
      setState({ kind: "error", message: "Couldn't reach framejam.ai. Check your connection and try again." });
    }
  }

  if (subscribed) {
    return (
      <p className="fc-updates-done" role="status">
        <Check className="fc-i sm" />
        <span>
          You get updates at <b>{subscribed}</b>.
        </span>
      </p>
    );
  }

  const sending = state.kind === "sending";
  return (
    <form className="fc-updates" onSubmit={onSubmit}>
      <div className="row">
        <label className="fc-sr" htmlFor={`updates-${source}`}>
          Email
        </label>
        <input
          id={`updates-${source}`}
          className="fc-input"
          type="email"
          required
          autoComplete="email"
          placeholder="you@studio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
        />
        <button type="submit" className="fc-btn" disabled={sending}>
          {sending && <Loader2 className="fc-i sm fc-spin" />}
          Get updates
        </button>
      </div>
      {state.kind === "error" ? (
        <p className="fc-caption err" role="alert">
          {state.message}
        </p>
      ) : (
        <p className="fc-caption">New styles and releases. No spam.</p>
      )}
    </form>
  );
}

/** The community pitch plus the email signup. */
export function CommunityCard() {
  return (
    <section className="fc-card fc-community" aria-labelledby="community-title" data-testid="community-card">
      <div>
        <h2 id="community-title" className="fc-h3">
          Get great at making videos with AI
        </h2>
        <p className="fc-caption">
          Prompt Warrior is the community from the maker of Frame Jam. Learn the workflow, get new styles first, try features
          early, and bring your videos to the weekly calls.
        </p>
      </div>
      <a href={COMMUNITY_URL} target="_blank" rel="noreferrer" className="fc-btn primary sm join">
        Join Prompt Warrior
        <ArrowUpRight className="fc-i xs" />
      </a>
      <UpdatesForm source="app-projects" />
    </section>
  );
}

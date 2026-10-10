import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { pickHref, useActivePick } from "@/lib/use-active-pick";

/**
 * While an agent waits for a pick, a banner that goes to the pick page. On a playbook or style page it carries that
 * item along, so it starts out picked. The cross closes the pick, and the agent is told the user skipped it.
 */
export function PickBanner({ playbook, style }: { playbook?: string; style?: string }) {
  const pick = useActivePick();
  const [closed, setClosed] = useState<string | null>(null);
  if (!pick || closed === pick.id) return null;
  const relevant = (playbook && pick.kinds.includes("playbook")) || (style && pick.kinds.includes("style"));
  const what = pick.kinds.length === 2 ? "a playbook and a style" : `a ${pick.kinds[0]}`;
  return (
    <div className="fc-banner" data-testid="pick-banner">
      <Link to={pickHref(pick, { playbook, style })} className="fc-banner-link">
        <span className="fc-grow">
          <b>Your agent is waiting</b> for you to pick {what}
          {pick.title ? ` for "${pick.title}"` : ""}.
        </span>
        <span className="go">
          {relevant ? "Use this one" : "Pick"} <ArrowRight className="fc-i xs" />
        </span>
      </Link>
      <button
        type="button"
        className="fc-btn ghost icon sm round"
        aria-label="Not now"
        title="Not now"
        onClick={() => {
          setClosed(pick.id);
          void api.dismissPick(pick.id).catch(() => {});
        }}
      >
        <X className="fc-i sm" />
      </button>
    </div>
  );
}

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { pickHref, useActivePick } from "@/lib/use-active-pick";

/**
 * While an agent waits for a pick, a banner that goes to the pick page. On a playbook or style page it carries that
 * item along, so it starts out picked.
 */
export function PickBanner({ playbook, style }: { playbook?: string; style?: string }) {
  const pick = useActivePick();
  if (!pick) return null;
  const relevant = (playbook && pick.kinds.includes("playbook")) || (style && pick.kinds.includes("style"));
  const what = pick.kinds.length === 2 ? "a playbook and a style" : `a ${pick.kinds[0]}`;
  return (
    <Link to={pickHref(pick, { playbook, style })} className="fc-banner" data-testid="pick-banner">
      <span className="fc-grow">
        <b>Your agent is waiting</b> for you to pick {what}
        {pick.title ? ` for "${pick.title}"` : ""}.
      </span>
      <span className="go">
        {relevant ? "Use this one" : "Pick"} <ArrowRight className="fc-i xs" />
      </span>
    </Link>
  );
}

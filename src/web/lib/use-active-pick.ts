import { useEffect, useState } from "react";
import { api, type VideoPick } from "@/lib/api";

/** The pick an agent is waiting on right now, if any. Polls, because the agent starts it from another process. */
export function useActivePick(everyMs = 3000) {
  const [pick, setPick] = useState<VideoPick | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .activePick()
        .then((p) => !cancelled && setPick(p))
        .catch(() => {});
    void load();
    const timer = window.setInterval(load, everyMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [everyMs]);
  return pick;
}

export function pickHref(pick: VideoPick, preselect?: { playbook?: string; style?: string }) {
  const q = new URLSearchParams();
  if (preselect?.playbook) q.set("playbook", preselect.playbook);
  if (preselect?.style) q.set("style", preselect.style);
  const s = q.toString();
  return `/pick/${pick.id}${s ? `?${s}` : ""}`;
}

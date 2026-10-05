import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { CodeBlock } from "@/components/setup-steps";
import { api, type UpdateInfo } from "@/lib/api";

const DISMISSED_KEY = "framejam:update-dismissed";

/** One line on the Projects page when a newer version is on npm, with the command that updates everything. */
export function UpdateNotice() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    api
      .update()
      .then((i) => !cancelled && setInfo(i))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info?.outdated || !info.latest || dismissed === info.latest) return null;
  const latest = info.latest;

  return (
    <section className="fc-card fc-col" style={{ gap: 10 }} aria-label="Update available" data-testid="update-notice">
      <div className="fc-row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
        <div className="fc-grow">
          <b>FrameJam {latest} is out.</b> <span className="fc-t2">You have {info.current}. Paste this in a terminal, then restart your agent:</span>
        </div>
        <button
          type="button"
          className="fc-btn ghost icon sm round"
          aria-label="Dismiss"
          onClick={() => {
            try {
              localStorage.setItem(DISMISSED_KEY, latest);
            } catch {
              /* private mode: it just comes back next time */
            }
            setDismissed(latest);
          }}
        >
          <X className="fc-i sm" />
        </button>
      </div>
      <CodeBlock code={info.command} />
    </section>
  );
}

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { CodeBlock } from "@/components/setup-steps";
import { api, type SkillStatus, type UpdateInfo } from "@/lib/api";

const DISMISSED_KEY = "framejam:update-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * One line on the Projects page when a newer version is on npm, or when an installed copy of the agent skill is older
 * than the one this FrameJam ships, with the command that updates everything.
 */
export function UpdateNotice() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [skill, setSkill] = useState<SkillStatus | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  useEffect(() => {
    let cancelled = false;
    api
      .update()
      .then((i) => !cancelled && setInfo(i))
      .catch(() => {});
    api
      .skillStatus()
      .then((s) => !cancelled && setSkill(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const notice =
    info?.outdated && info.latest
      ? {
          key: info.latest,
          title: `FrameJam ${info.latest} is out.`,
          body: `You have ${info.current}. Paste this in a terminal, then restart your agent:`,
          command: info.command,
        }
      : skill?.outdated && skill.current !== null
        ? {
            key: `skill-${skill.current}`,
            title: "Your FrameJam skill is out of date.",
            body: "Your agent is following older instructions than this FrameJam expects. Paste this in a terminal, then restart your agent:",
            command: skill.command,
          }
        : null;
  if (!notice || dismissed === notice.key) return null;

  return (
    <section className="fc-card fc-col" style={{ gap: 10 }} aria-label="Update available" data-testid="update-notice">
      <div className="fc-row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
        <div className="fc-grow">
          <b>{notice.title}</b> <span className="fc-t2">{notice.body}</span>
        </div>
        <button
          type="button"
          className="fc-btn ghost icon sm round"
          aria-label="Dismiss"
          onClick={() => {
            try {
              localStorage.setItem(DISMISSED_KEY, notice.key);
            } catch {
              /* private mode: it just comes back next time */
            }
            setDismissed(notice.key);
          }}
        >
          <X className="fc-i sm" />
        </button>
      </div>
      <CodeBlock code={notice.command} />
    </section>
  );
}

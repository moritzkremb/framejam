import { ArrowUpRight, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { FeedbackButton } from "@/components/feedback";
import { pickHref, useActivePick } from "@/lib/use-active-pick";

export const DOCS_URL = "https://www.framejam.ai/docs";

export function Wordmark() {
  return (
    <Link to="/" className="fc-logo" aria-label="FrameJam projects">
      <img className="on-dark" src="/brand/lockup.svg" alt="" />
      <img className="on-light" src="/brand/lockup-light.svg" alt="" />
    </Link>
  );
}

export function Dots({ colors, size }: { colors: string[]; size?: number }) {
  return (
    <span className="sw">
      {colors.slice(0, 3).map((c, i) => (
        <span key={i} style={{ background: c, ...(size ? { width: size, height: size } : {}) }} />
      ))}
    </span>
  );
}

const NAV = [
  { to: "/playbooks", label: "Playbooks", end: false },
  { to: "/styles", label: "Styles", end: false },
  { to: "/", label: "Projects", end: true },
];

/** Shown only while an agent waits for the user to pick a playbook and style for a video. */
function WaitingPickChip() {
  const pick = useActivePick();
  const { pathname } = useLocation();
  if (!pick || pathname.startsWith("/pick/")) return null;
  return (
    <Link to={pickHref(pick)} className="fc-style-chip fc-waiting" title="Your agent is waiting for you to pick">
      <span className="dot" aria-hidden />
      <span className="fc-truncate">Your agent is waiting</span>
    </Link>
  );
}

/** App header on every top-level page: wordmark, the main pages, Docs, and a chip while an agent waits for a pick. */
export function HomeHeader() {
  return (
    <header className="fc-header">
      <Wordmark />
      <nav className="fc-nav" aria-label="Main">
        {NAV.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "on" : "")}>
            {label}
          </NavLink>
        ))}
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className="ext docs">
          Docs
          <ArrowUpRight className="fc-i xs" aria-hidden />
          <span className="fc-sr">(opens in a new tab)</span>
        </a>
      </nav>
      <span className="fc-grow" />
      <FeedbackButton />
      <WaitingPickChip />
    </header>
  );
}

/** Header inside a review or a style: back, two-line title, and up to two controls. */
export function BackHeader({ to, title, sub, children }: { to: string; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="fc-header has-back">
      <Link to={to} className="fc-btn ghost icon round" aria-label="Back">
        <ChevronLeft className="fc-i" />
      </Link>
      <div className="titles">
        <span className="t" title={title}>
          {title}
        </span>
        {sub && <span className="s">{sub}</span>}
      </div>
      {children}
    </header>
  );
}

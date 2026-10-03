import { ArrowUpRight, ChevronLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { COMMUNITY_URL } from "@/components/community";
import { FeedbackButton } from "@/components/feedback";
import { api, type PresetSummary } from "@/lib/api";

export const PRESET_SELECTED_EVENT = "framejam:preset-selected";
export const DOCS_URL = "https://framejam.ai";

export function Wordmark() {
  return (
    <Link to="/" className="fc-logo" aria-label="Frame Jam projects">
      <img className="on-dark" src="/brand/lockup.svg" alt="" />
      <img className="on-light" src="/brand/lockup-light.svg" alt="" />
    </Link>
  );
}

/** The style in use, as its colour dots and name. Updates when a style is picked anywhere in the app. */
function useSelectedStyle() {
  const [style, setStyle] = useState<PresetSummary | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      api
        .presets()
        .then(({ selected, presets }) => !cancelled && setStyle(presets.find((p) => p.id === selected) ?? null))
        .catch(() => !cancelled && setStyle(null));
    void refresh();
    window.addEventListener(PRESET_SELECTED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PRESET_SELECTED_EVENT, refresh);
    };
  }, []);
  return style;
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
  { to: "/setup", label: "Setup", end: false },
  { to: "/styles", label: "Styles", end: false },
  { to: "/", label: "Projects", end: true },
];

/** App header on every top-level page: wordmark, the main pages, Docs, and the style in use. */
export function HomeHeader() {
  const style = useSelectedStyle();
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
        <a href={COMMUNITY_URL} target="_blank" rel="noreferrer" className="ext community">
          Community
          <ArrowUpRight className="fc-i xs" aria-hidden />
          <span className="fc-sr">(opens in a new tab)</span>
        </a>
      </nav>
      <span className="fc-grow" />
      <FeedbackButton />
      {style ? (
        <Link
          to={`/styles/${style.id}`}
          className="fc-style-chip"
          title="Your selected style. Your agent uses it for the next video."
          aria-label={`Selected style: ${style.name}`}
        >
          <Dots colors={Object.values(style.palette)} />
          <span className="lbl">Selected style</span>
          <span className="fc-truncate">{style.name}</span>
        </Link>
      ) : style === null ? (
        <Link to="/styles" className="fc-style-chip empty">
          No style picked
        </Link>
      ) : null}
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

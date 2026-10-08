import { ArrowUpRight, BookOpen, ChevronDown, ChevronLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { FeedbackButton } from "@/components/feedback";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/menu";
import { api, type PlaybookSummary, type PresetSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

export const PRESET_SELECTED_EVENT = "framejam:preset-selected";
export const PLAYBOOK_SELECTED_EVENT = "framejam:playbook-selected";
export const DOCS_URL = "https://www.framejam.ai/docs";

export function Wordmark() {
  return (
    <Link to="/" className="fc-logo" aria-label="FrameJam projects">
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

function useSelectedPlaybook() {
  const [playbook, setPlaybook] = useState<PlaybookSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      api
        .playbooks()
        .then(({ selected, playbooks }) => !cancelled && setPlaybook(playbooks.find((p) => p.id === selected) ?? null))
        .catch(() => !cancelled && setPlaybook(null));
    void refresh();
    window.addEventListener(PLAYBOOK_SELECTED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PLAYBOOK_SELECTED_EVENT, refresh);
    };
  }, []);
  return playbook;
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
  { to: "/styles", label: "Styles", end: false },
  { to: "/playbooks", label: "Playbooks", end: false },
  { to: "/", label: "Projects", end: true },
];

/** The playbook and style your agent uses next, as one chip that opens a menu to see or change either. */
function InUseChip({ style, playbook }: { style: PresetSummary | null; playbook: PlaybookSummary | null }) {
  const navigate = useNavigate();
  const names = [playbook?.name, style?.name].filter(Boolean).join(" · ");
  return (
    <Menu
      label="Playbook and style in use"
      trigger={
        <button
          type="button"
          className={cn("fc-style-chip fc-inuse", !names && "empty")}
          title="The playbook and style your agent uses for the next video"
          aria-label={names ? `In use: ${names}` : "No playbook or style picked"}
        >
          {style ? <Dots colors={Object.values(style.palette)} /> : names ? <BookOpen className="fc-i xs" aria-hidden /> : null}
          <span className="fc-truncate">{names || "Nothing picked"}</span>
          <ChevronDown className="fc-i xs" aria-hidden />
        </button>
      }
    >
      <MenuLabel>Playbook</MenuLabel>
      <MenuItem onSelect={() => navigate(playbook ? `/playbooks/${playbook.id}` : "/playbooks")}>
        {playbook ? playbook.name : "Pick a playbook"}
      </MenuItem>
      <MenuSeparator />
      <MenuLabel>Style</MenuLabel>
      <MenuItem onSelect={() => navigate(style ? `/styles/${style.id}` : "/styles")}>{style ? style.name : "Pick a style"}</MenuItem>
    </Menu>
  );
}

/** App header on every top-level page: wordmark, the main pages, Docs, and the playbook and style in use. */
export function HomeHeader() {
  const style = useSelectedStyle();
  const playbook = useSelectedPlaybook();
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
      {style !== undefined && <InUseChip style={style} playbook={playbook} />}
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

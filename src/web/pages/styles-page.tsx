import { ArrowRight, Check, ChevronDown, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HomeHeader } from "@/components/header";
import { Menu, MenuItem } from "@/components/menu";
import { isOffline, Offline } from "@/components/states";
import { api, type PresetSummary } from "@/lib/api";
import { useStyleSelection } from "@/lib/use-style";
import { cn } from "@/lib/utils";

const FORMATS = ["All", "16:9", "9:16", "1:1"] as const;
const PACES = ["slow", "medium", "fast"] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function StyleCard({ preset, inUse, busy, onUse }: { preset: PresetSummary; inUse: boolean; busy: boolean; onUse(): void }) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const open = () => navigate(`/styles/${preset.id}`);
  return (
    <div
      className={cn("fc-scard", inUse && "is-selected")}
      data-testid="preset-card"
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      onMouseEnter={() => void videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = videoRef.current;
        if (v) {
          v.pause();
          v.load();
        }
      }}
    >
      <div className="media" style={{ background: preset.palette.background }}>
        {preset.previewUrl ? (
          <video
            ref={videoRef}
            src={preset.previewUrl}
            poster={preset.posterUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className={preset.format === "16:9" ? "cover" : "contain"}
          />
        ) : preset.posterUrl ? (
          <img src={preset.posterUrl} alt="" className="contain" />
        ) : null}
        <button
          type="button"
          className={cn("fc-use use", inUse && "on")}
          data-testid="use-style-quick"
          disabled={busy}
          aria-pressed={inUse}
          onClick={(e) => {
            e.stopPropagation();
            onUse();
          }}
        >
          {inUse ? (
            <>
              <Check className="fc-i" />
              In use
            </>
          ) : (
            "Use"
          )}
        </button>
        <span className="br fc-badge on-video">
          {preset.format} · {cap(preset.pacing)}
        </span>
      </div>
      <div>
        <div className="name">
          <span className="fc-truncate">{preset.name}</span>
          <span className="fc-dots">
            {Object.values(preset.palette)
              .slice(0, 3)
              .map((c, i) => (
                <span key={i} style={{ background: c }} />
              ))}
          </span>
        </div>
        <div className="tagline">{preset.tagline}</div>
      </div>
    </div>
  );
}

function Dropdown({ label, value, options, onChange }: { label: string; value: string | null; options: string[]; onChange(v: string | null): void }) {
  if (value) {
    return (
      <button type="button" className="fc-drop on" onClick={() => onChange(null)} aria-label={`Clear ${label}`}>
        {cap(value)} <X className="fc-i xs" />
      </button>
    );
  }
  return (
    <Menu
      align="start"
      label={label}
      trigger={
        <button type="button" className="fc-drop">
          {label} <ChevronDown className="fc-i xs" />
        </button>
      }
    >
      {options.map((o) => (
        <MenuItem key={o} onSelect={() => onChange(o)}>
          {cap(o)}
        </MenuItem>
      ))}
    </Menu>
  );
}

export function StylesPage() {
  const [data, setData] = useState<{ selected: string | null; presets: PresetSummary[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [format, setFormat] = useState<string>("All");
  const [pace, setPace] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [connected, setConnected] = useState(true);
  const selection = useStyleSelection(null);
  const { setSelected } = selection;

  useEffect(() => {
    api
      .presets()
      .then((d) => {
        setData(d);
        setSelected(d.selected);
      })
      .catch(setError);
    api
      .health()
      .then((h) => setConnected(Boolean(h.agent)))
      .catch(() => {});
  }, [setSelected]);

  const moods = useMemo(() => [...new Set(data?.presets.flatMap((p) => p.mood) ?? [])].sort(), [data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.presets ?? []).filter(
      (p) =>
        (format === "All" || p.format === format) &&
        (!pace || p.pacing === pace) &&
        (!mood || p.mood.includes(mood)) &&
        (!q || [p.name, p.tagline, p.description, ...p.mood, ...(p.tags ?? [])].join(" ").toLowerCase().includes(q)),
    );
  }, [data, format, pace, mood, query]);

  return (
    <div className="fc-screen">
      <HomeHeader />
      <main className="fc-main">
        {!connected && (
          <Link to="/home#setup" className="fc-banner">
            <Sparkles className="fc-i sm" />
            <span className="fc-grow">
              <b>New here?</b> Connect your agent with one message you paste into your chat.
            </span>
            <span className="go">
              Set up <ArrowRight className="fc-i xs" />
            </span>
          </Link>
        )}
        <div>
          <h1 className="fc-h1">Styles</h1>
          <p className="fc-lede">Pick a look for your next video. Press Use, and your agent builds with it. Open one to see the details.</p>
        </div>
        {error && !data ? (
          isOffline(error) ? <Offline /> : <p className="fc-caption">{String((error as Error).message)}</p>
        ) : (
          <>
            <div className="fc-col">
              <label className="fc-search">
                <Search className="fc-i sm" />
                <input
                  className="fc-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${data?.presets.length ?? ""} styles`}
                />
              </label>
              <div className="fc-filters">
                <div className="fc-seg" role="group" aria-label="Format">
                  {FORMATS.map((f) => (
                    <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
                      {f}
                    </button>
                  ))}
                </div>
                <Dropdown label="Mood" value={mood} options={moods} onChange={setMood} />
                <Dropdown label="Pace" value={pace} options={[...PACES]} onChange={setPace} />
              </div>
            </div>
            {!data ? (
              <div className="fc-sgrid">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="fc-skel" style={{ aspectRatio: "4 / 3.6" }} />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="fc-empty">
                <div className="fc-h3">No styles match</div>
                <button
                  type="button"
                  className="fc-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setFormat("All");
                    setMood(null);
                    setPace(null);
                    setQuery("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="fc-sgrid">
                {visible.map((p) => (
                  <StyleCard
                    key={p.id}
                    preset={p}
                    inUse={selection.selected === p.id}
                    busy={selection.busy === p.id}
                    onUse={() => void selection.toggle(p)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

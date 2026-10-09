import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FilterDropdown } from "@/components/filter-dropdown";
import { BackHeader, Dots } from "@/components/header";
import { NotHere } from "@/components/states";
import { api, type PlaybookSummary, type PresetSummary, type VideoPick } from "@/lib/api";
import { cn } from "@/lib/utils";
import { costBadge } from "../../shared/playbooks";

type Kind = "playbook" | "style";

/** A selectable gallery card; hovering plays the example. */
function Tile({
  selected,
  onSelect,
  poster,
  preview,
  contain,
  name,
  meta,
  children,
}: {
  selected: boolean;
  onSelect(): void;
  poster?: string;
  preview?: string;
  contain?: boolean;
  name: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  const video = useRef<HTMLVideoElement>(null);
  return (
    <button
      type="button"
      className={cn("fc-scard fc-pick-tile", selected && "is-selected")}
      aria-pressed={selected}
      onClick={onSelect}
      onMouseEnter={() => void video.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = video.current;
        if (v) {
          v.pause();
          v.load();
        }
      }}
    >
      <div className="media">
        {preview ? (
          <video ref={video} src={preview} poster={poster} muted loop playsInline preload="none" className={contain ? "contain" : "cover"} />
        ) : poster ? (
          <img src={poster} alt="" className={contain ? "contain" : "cover"} />
        ) : (
          <div className="fc-pick-none">{children}</div>
        )}
        {selected && (
          <span className="fc-use use on">
            <Check className="fc-i" />
            Picked
          </span>
        )}
      </div>
      <div>
        <div className="name">
          <span className="fc-truncate">{name}</span>
          {meta}
        </div>
      </div>
    </button>
  );
}

/** One line of the overview: what's picked, opening the list of choices below. */
function Field({
  label,
  open,
  disabled,
  onToggle,
  thumb,
  name,
  sub,
}: {
  label: string;
  open: boolean;
  disabled?: boolean;
  onToggle(): void;
  thumb?: ReactNode;
  name: string;
  sub?: ReactNode;
}) {
  return (
    <button type="button" className={cn("fc-pick-field", open && "open")} aria-expanded={open} disabled={disabled} onClick={onToggle}>
      <span className="lbl">{label}</span>
      <span className="thumb">{thumb}</span>
      <span className="fc-grow fc-col" style={{ gap: 2, minWidth: 0 }}>
        <span className="fc-truncate nm">{name}</span>
        {sub && <span className="fc-truncate fc-caption">{sub}</span>}
      </span>
      {!disabled && <ChevronDown className="fc-i sm chev" aria-hidden />}
    </button>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange(v: string): void; placeholder: string }) {
  return (
    <label className="fc-search">
      <Search className="fc-i sm" />
      <input className="fc-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Seg({ value, options, onChange, label }: { value: string; options: string[]; onChange(v: string): void; label: string }) {
  return (
    <div className="fc-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function PickPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const [pick, setPick] = useState<VideoPick | null>(null);
  const [missing, setMissing] = useState(false);
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [styles, setStyles] = useState<PresetSummary[]>([]);
  const [playbookId, setPlaybookId] = useState<string | null>(params.get("playbook"));
  const [styleId, setStyleId] = useState<string | null>(params.get("style"));
  const [open, setOpen] = useState<Kind | null>(null);
  const [sending, setSending] = useState(false);
  // Filters, like the galleries.
  const [pbQuery, setPbQuery] = useState("");
  const [pbFormat, setPbFormat] = useState("All");
  const [stQuery, setStQuery] = useState("");
  const [stFormat, setStFormat] = useState("All");
  const [stMood, setStMood] = useState<string | null>(null);
  const [stPace, setStPace] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .pick(id)
      .then(setPick)
      .catch(() => setMissing(true));
    api
      .playbooks()
      .then((d) => setPlaybooks(d.playbooks))
      .catch(() => {});
    api
      .presets()
      .then((d) => setStyles(d.presets))
      .catch(() => {});
  }, [id]);

  const visiblePlaybooks = useMemo(() => {
    const q = pbQuery.trim().toLowerCase();
    return playbooks.filter(
      (p) =>
        (pbFormat === "All" || (pbFormat === "9:16" ? p.previewShape === "tall" : p.previewShape === "wide")) &&
        (!q || [p.name, p.tagline, p.description, p.get, ...p.bring, ...(p.tags ?? [])].join(" ").toLowerCase().includes(q)),
    );
  }, [playbooks, pbQuery, pbFormat]);

  const moods = useMemo(() => [...new Set(styles.flatMap((s) => s.mood))].sort(), [styles]);
  const visibleStyles = useMemo(() => {
    const q = stQuery.trim().toLowerCase();
    return styles.filter(
      (s) =>
        (stFormat === "All" || s.format === stFormat) &&
        (!stMood || s.mood.includes(stMood)) &&
        (!stPace || s.pacing === stPace) &&
        (!q || [s.name, s.tagline, s.description, ...s.mood, ...(s.tags ?? [])].join(" ").toLowerCase().includes(q)),
    );
  }, [styles, stQuery, stFormat, stMood, stPace]);

  if (missing) {
    return (
      <div className="fc-screen">
        <BackHeader to="/" title="Pick for your video" />
        <main className="fc-main">
          <NotHere title="This pick isn't here" message="Ask your agent to start a new one." back="/" backLabel="Back to projects" />
        </main>
      </div>
    );
  }
  if (!pick) {
    return (
      <div className="fc-screen">
        <BackHeader to="/" title="Pick for your video" />
        <main className="fc-main">
          <div className="fc-skel" style={{ height: 240 }} />
        </main>
      </div>
    );
  }

  const wants = (k: Kind) => pick.kinds.includes(k);
  const chosenPlaybook = playbooks.find((p) => p.id === playbookId);
  const chosenStyle = styles.find((s) => s.id === styleId);
  const stylesUnused = chosenPlaybook?.styles === "none";
  const sub = pick.title ? `For: ${pick.title}` : "For the video your agent is about to make";

  if (pick.status !== "waiting") {
    const sentPlaybook = playbooks.find((p) => p.id === pick.playbookId)?.name;
    const sentStyle = styles.find((s) => s.id === pick.styleId)?.name;
    return (
      <div className="fc-screen">
        <BackHeader to="/" title="Pick for your video" sub={sub} />
        <main className="fc-main">
          <div className="fc-empty">
            {pick.status === "picked" ? (
              <>
                <div className="fc-h3">Sent to your agent</div>
                <p className="fc-caption">
                  {`${[wants("playbook") && (sentPlaybook ? `Playbook: ${sentPlaybook}` : "No playbook"), wants("style") && (sentStyle ? `Style: ${sentStyle}` : "No style")]
                    .filter(Boolean)
                    .join(" · ")}. Go back to your chat; your agent is starting the video.`}
                </p>
              </>
            ) : (
              <>
                <div className="fc-h3">This pick was replaced</div>
                <p className="fc-caption">Your agent started a newer one. Use the link it posted most recently.</p>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  const choose = (kind: Kind, value: string | null) => {
    if (kind === "playbook") setPlaybookId(value);
    else setStyleId(value);
    setOpen(null);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const start = async () => {
    setSending(true);
    try {
      setPick(await api.sendPick(pick.id, { playbookId, styleId: stylesUnused ? null : styleId }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const toggle = (kind: Kind) => setOpen((o) => (o === kind ? null : kind));
  const thumb = (url?: string) => (url ? <img src={url} alt="" /> : <span className="empty" />);

  return (
    <div className="fc-screen">
      <BackHeader to="/" title="Pick for your video" sub={sub} />
      <main className="fc-main fc-pick-page">
        <div ref={top} className="fc-pick-intro">
          <span className="dot" aria-hidden />
          <span>
            <b>Your agent is waiting.</b> Choose {wants("playbook") && wants("style") ? "a playbook and a style" : wants("playbook") ? "a playbook" : "a style"}, or
            none, then press Start.
          </span>
        </div>

        <div className="fc-pick-overview">
          {wants("playbook") && (
            <Field
              label="Playbook"
              open={open === "playbook"}
              onToggle={() => toggle("playbook")}
              thumb={thumb(chosenPlaybook?.posterUrl)}
              name={chosenPlaybook?.name ?? "No playbook"}
              sub={chosenPlaybook ? chosenPlaybook.tagline : "Your agent makes it its own way"}
            />
          )}
          {wants("style") && (
            <Field
              label="Style"
              open={open === "style"}
              disabled={stylesUnused}
              onToggle={() => toggle("style")}
              thumb={thumb(stylesUnused ? undefined : chosenStyle?.posterUrl)}
              name={stylesUnused ? "Not used" : (chosenStyle?.name ?? "No style")}
              sub={stylesUnused ? `${chosenPlaybook?.name} has its own look` : chosenStyle ? chosenStyle.tagline : "Your agent picks the look"}
            />
          )}
          <div className="fc-pick-go">
            <span className="fc-caption fc-grow">Your agent starts as soon as you press Start.</span>
            <button type="button" className="fc-btn primary" disabled={sending} onClick={() => void start()} data-testid="pick-start">
              {sending ? <Loader2 className="fc-i sm fc-spin" /> : <Check className="fc-i sm" />}
              Start
            </button>
          </div>
        </div>

        {open === "playbook" && (
          <section className="fc-pick-panel" aria-label="Choose a playbook">
            <header>
              <h2 className="fc-h2">Choose a playbook</h2>
              <span className="fc-grow" />
              <button type="button" className="fc-btn ghost icon sm round" aria-label="Close" onClick={() => setOpen(null)}>
                <X className="fc-i sm" />
              </button>
            </header>
            <div className="fc-filters">
              <SearchBox value={pbQuery} onChange={setPbQuery} placeholder={`Search ${playbooks.length} playbooks`} />
              <Seg label="Format" value={pbFormat} options={["All", "16:9", "9:16"]} onChange={setPbFormat} />
            </div>
            <div className="fc-sgrid">
              {!pbQuery && pbFormat === "All" && (
                <Tile selected={playbookId === null} onSelect={() => choose("playbook", null)} name="No playbook">
                  Your agent makes it its own way
                </Tile>
              )}
              {visiblePlaybooks.map((p) => (
                <Tile
                  key={p.id}
                  selected={playbookId === p.id}
                  onSelect={() => choose("playbook", p.id)}
                  poster={p.posterUrl}
                  preview={p.previewUrl}
                  contain={p.previewShape !== "wide"}
                  name={p.name}
                  meta={<span className="fc-caption">{costBadge(p.needs)}</span>}
                />
              ))}
            </div>
            {visiblePlaybooks.length === 0 && <p className="fc-caption">No playbooks match.</p>}
          </section>
        )}

        {open === "style" && (
          <section className="fc-pick-panel" aria-label="Choose a style">
            <header>
              <h2 className="fc-h2">Choose a style</h2>
              <span className="fc-grow" />
              <button type="button" className="fc-btn ghost icon sm round" aria-label="Close" onClick={() => setOpen(null)}>
                <X className="fc-i sm" />
              </button>
            </header>
            <div className="fc-filters">
              <SearchBox value={stQuery} onChange={setStQuery} placeholder={`Search ${styles.length} styles`} />
              <Seg label="Format" value={stFormat} options={["All", "16:9", "9:16", "1:1"].filter((f) => f === "All" || styles.some((s) => s.format === f))} onChange={setStFormat} />
              <FilterDropdown label="Mood" value={stMood} options={moods} onChange={setStMood} />
              <FilterDropdown label="Pace" value={stPace} options={["slow", "medium", "fast"]} onChange={setStPace} />
            </div>
            <div className="fc-sgrid">
              {!stQuery && stFormat === "All" && !stMood && !stPace && (
                <Tile selected={styleId === null} onSelect={() => choose("style", null)} name="No style">
                  Your agent picks the look
                </Tile>
              )}
              {visibleStyles.map((s) => (
                <Tile
                  key={s.id}
                  selected={styleId === s.id}
                  onSelect={() => choose("style", s.id)}
                  poster={s.posterUrl}
                  preview={s.previewUrl}
                  contain={s.format !== "16:9"}
                  name={s.name}
                  meta={<Dots colors={Object.values(s.palette)} />}
                />
              ))}
            </div>
            {visibleStyles.length === 0 && <p className="fc-caption">No styles match.</p>}
          </section>
        )}
      </main>
    </div>
  );
}

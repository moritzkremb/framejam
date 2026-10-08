import { Check, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { BackHeader, Dots } from "@/components/header";
import { NotHere } from "@/components/states";
import { api, type PlaybookSummary, type PresetSummary, type VideoPick } from "@/lib/api";
import { cn } from "@/lib/utils";
import { costBadge } from "../../shared/playbooks";

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

function Section({ title, hint, children, tools }: { title: string; hint: string; children: ReactNode; tools?: ReactNode }) {
  return (
    <section className="fc-col" style={{ gap: 12 }}>
      <div>
        <h2 className="fc-h2">{title}</h2>
        <p className="fc-caption">{hint}</p>
      </div>
      {tools}
      <div className="fc-sgrid">{children}</div>
    </section>
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
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);

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

  const visibleStyles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? styles.filter((s) => [s.name, s.tagline, ...s.mood].join(" ").toLowerCase().includes(q)) : styles;
  }, [styles, query]);

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

  const wants = (k: "playbook" | "style") => pick.kinds.includes(k);
  const chosenPlaybook = playbooks.find((p) => p.id === playbookId);
  const playbookName = chosenPlaybook?.name;
  const stylesUnused = chosenPlaybook?.styles === "none";
  const styleName = styles.find((s) => s.id === styleId)?.name;
  const summary = [wants("playbook") && (playbookName ?? "No playbook"), wants("style") && !stylesUnused && (styleName ?? "No style")]
    .filter(Boolean)
    .join(" · ");
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

  return (
    <div className="fc-screen">
      <BackHeader to="/" title="Pick for your video" sub={sub} />
      <main className="fc-main fc-pick-page">
        <div className="fc-pick-intro">
          <span className="dot" aria-hidden />
          <span>
            <b>Your agent is waiting.</b> Pick {wants("playbook") && wants("style") ? "a playbook and a style" : wants("playbook") ? "a playbook" : "a style"},
            or none, then press Start. Hover a card to see its example.
          </span>
        </div>

        {wants("playbook") && (
          <Section title="Playbook" hint="How the video gets made: the steps and tools for one kind of video.">
            <Tile selected={playbookId === null} onSelect={() => setPlaybookId(null)} name="No playbook">
              Your agent makes it its own way
            </Tile>
            {playbooks.map((p) => (
              <Tile
                key={p.id}
                selected={playbookId === p.id}
                onSelect={() => setPlaybookId(p.id)}
                poster={p.posterUrl}
                preview={p.previewUrl}
                contain={p.previewShape !== "wide"}
                name={p.name}
                meta={<span className="fc-caption">{costBadge(p.needs)}</span>}
              />
            ))}
          </Section>
        )}

        {wants("style") && stylesUnused && (
          <section className="fc-col" style={{ gap: 4 }}>
            <h2 className="fc-h2">Style</h2>
            <p className="fc-caption">{playbookName} has its own look, so it doesn&apos;t use a style.</p>
          </section>
        )}

        {wants("style") && !stylesUnused && (
          <Section
            title="Style"
            hint="The look: colours, textures, type and motion. Your agent builds your own subject in it."
            tools={
              <label className="fc-search">
                <Search className="fc-i sm" />
                <input className="fc-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${styles.length} styles`} />
              </label>
            }
          >
            {!query && (
              <Tile selected={styleId === null} onSelect={() => setStyleId(null)} name="No style">
                Your agent picks the look
              </Tile>
            )}
            {visibleStyles.map((s) => (
              <Tile
                key={s.id}
                selected={styleId === s.id}
                onSelect={() => setStyleId(s.id)}
                poster={s.posterUrl}
                preview={s.previewUrl}
                contain={s.format !== "16:9"}
                name={s.name}
                meta={<Dots colors={Object.values(s.palette)} />}
              />
            ))}
          </Section>
        )}

        <div className="fc-pick-bar">
          <span className="fc-truncate">{summary}</span>
          <span className="fc-grow" />
          <button type="button" className="fc-btn primary" disabled={sending} onClick={() => void start()} data-testid="pick-start">
            {sending ? <Loader2 className="fc-i sm fc-spin" /> : <Check className="fc-i sm" />}
            Start
          </button>
        </div>
      </main>
    </div>
  );
}

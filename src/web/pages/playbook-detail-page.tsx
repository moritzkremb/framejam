import { ArrowUpRight, ChevronRight, Copy, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { BackHeader } from "@/components/header";
import { PromptBlock } from "@/components/setup-steps";
import { NotHere } from "@/components/states";
import { api, copyText, type PlaybookSummary } from "@/lib/api";
import { PickBanner } from "@/components/pick-banner";
import { VideoBackdrop } from "@/components/video-backdrop";
import { cn } from "@/lib/utils";
import type { PlaybookNeed } from "../../shared/types";
import { costBadge, groupNeeds, playbookPrompt, projectLabel, stylesPredicate } from "../../shared/playbooks";

async function copy(text: string, what: string) {
  try {
    await copyText(text);
    toast.success(`Copied ${what}`);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

function SideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fc-pb-block">
      <h2 className="fc-pb-label">{title}</h2>
      {children}
    </div>
  );
}

function NeedLine({ need }: { need: PlaybookNeed }) {
  const cost = need.where === "service" ? need.cost : need.where === "computer" ? "free" : undefined;
  return (
    <li>
      <span className="n">
        {need.name}
        {need.optional && <span className="opt"> · optional</span>}
      </span>
      {cost && <span className={cn("fc-pb-cost", cost === "paid" && "paid")}>{cost}</span>}
      {need.examples?.length ? <span className="ex">{need.examples.slice(0, 3).join(", ")}</span> : null}
    </li>
  );
}

/** Plays the example, with a loading state until the first frame arrives and a message if it can't load. */
function ExampleVideo({ p }: { p: Pick<PlaybookSummary, "previewUrl" | "posterUrl" | "previewShape"> }) {
  const [state, setState] = useState<"loading" | "ready" | "error">(p.previewUrl ? "loading" : "error");
  const video = useRef<HTMLVideoElement>(null);
  const tall = p.previewShape !== "wide";
  return (
    <div className={cn("fc-style-media fc-pb-media", tall && "tall")}>
      {tall && (p.previewUrl || p.posterUrl) && <VideoBackdrop video={video} poster={p.posterUrl} />}
      {p.previewUrl && state !== "error" ? (
        <video
          ref={video}
          src={p.previewUrl}
          poster={p.posterUrl}
          autoPlay
          muted
          loop
          playsInline
          controls
          onLoadedData={() => setState("ready")}
          onError={() => setState("error")}
        />
      ) : p.posterUrl ? (
        <img src={p.posterUrl} alt="" />
      ) : (
        <div className="fc-style-nopreview" style={{ aspectRatio: tall ? "9 / 16" : "16 / 9" }}>
          No example video for this playbook yet.
        </div>
      )}
      {state === "loading" && (
        <div className="fc-pb-loading" role="status">
          <Loader2 className="fc-i sm fc-spin" /> Loading the example
        </div>
      )}
      {state === "error" && p.previewUrl && <div className="fc-pb-novideo">Example video unavailable</div>}
    </div>
  );
}

export function PlaybookDetailPage() {
  const { id = "" } = useParams();
  const [data, setData] = useState<{ playbook: PlaybookSummary } | null>(null);
  const [missing, setMissing] = useState(false);
  const [styleNames, setStyleNames] = useState<Record<string, string>>({});
  // Which example plays: the playbook's own look (null) or one of the styles made for it.
  const [shown, setShown] = useState<{ playbook: string; style: string } | null>(null);

  useEffect(() => {
    setData(null);
    api
      .playbook(id)
      .then(setData)
      .catch(() => setMissing(true));
  }, [id]);

  useEffect(() => {
    if (!data?.playbook.featuredStyles.length) return;
    api
      .presets()
      .then((d) => setStyleNames(Object.fromEntries(d.presets.map((s) => [s.id, s.name]))))
      .catch(() => {});
  }, [data]);

  if (missing) {
    return (
      <div className="fc-screen">
        <BackHeader to="/playbooks" title="Playbooks" />
        <main className="fc-main">
          <NotHere title="This playbook isn't here" message="It may have been removed from the library." back="/playbooks" backLabel="Back to playbooks" />
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fc-screen">
        <BackHeader to="/playbooks" title="Playbook" />
        <main className="fc-main fc-style-page">
          <div className="fc-skel" style={{ aspectRatio: "16 / 9", borderRadius: 14 }} />
          <div className="fc-skel" style={{ height: 120 }} />
        </main>
      </div>
    );
  }

  const { playbook: p } = data;
  const prompt = playbookPrompt(p);
  const predicate = stylesPredicate(p);
  const featured = p.featuredStyles.filter((s) => styleNames[s.id]);
  // The switcher: the main example, other examples, then the styles made for this playbook.
  const options = [
    ...p.examples.map((x) => ({ id: x.id, label: x.label, previewUrl: x.previewUrl, posterUrl: x.posterUrl, style: false })),
    ...featured.map((s) => ({ id: s.id, label: styleNames[s.id], previewUrl: s.previewUrl, posterUrl: s.posterUrl, style: true })),
  ];
  const picked = shown?.playbook === p.id ? options.find((o) => o.id === shown.style) : undefined;
  const shownStyle = picked?.style ? picked : undefined;
  const example = picked ? { ...p, previewUrl: picked.previewUrl, posterUrl: picked.posterUrl ?? p.posterUrl } : p;

  return (
    <div className="fc-screen">
      <BackHeader to="/playbooks" title={p.name} sub={`Playbook · by ${p.creator.name}`} />
      <main className="fc-main fc-style-page">
        <PickBanner playbook={p.id} style={shownStyle?.id} />
        {options.length > 0 && (
          <div className="fc-seg fc-pb-looks" role="group" aria-label="Example">
            <button type="button" aria-pressed={!picked} onClick={() => setShown(null)}>
              Default
            </button>
            {options.map((o) => (
              <button key={o.id} type="button" aria-pressed={picked?.id === o.id} onClick={() => setShown({ playbook: p.id, style: o.id })}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        <ExampleVideo key={`${p.id}:${picked?.id ?? ""}`} p={example} />

        <div className="fc-style-head">
          <div className="fc-grow">
            <h1 className="fc-h1">{p.name}</h1>
            <p className="fc-lede">{p.tagline}</p>
            <div className="fc-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <span className="fc-badge">{costBadge(p.needs)}</span>
              {p.format !== "any" && <span className="fc-badge">{p.format}</span>}
              <span className="fc-badge">{p.project === "new" ? "New project" : "Any project"}</span>
              <span className="fc-badge">v{p.version}</span>
            </div>
          </div>
          <div className="actions">
            <button type="button" className="fc-btn primary" onClick={() => void copy(prompt, "prompt for your agent")}>
              <Copy className="fc-i sm" /> Copy prompt
            </button>
          </div>
        </div>

        <div className="fc-pb-body">
          <div className="fc-pb-main">
            <p className="fc-style-desc">{p.description}</p>

            <div className="fc-pb-io">
              <div className="fc-pb-io-card">
                <h2 className="fc-pb-label">You bring</h2>
                <ul className="fc-pb-bullets">
                  {p.bring.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="fc-pb-io-card">
                <h2 className="fc-pb-label">You get</h2>
                <p>{p.get}</p>
              </div>
            </div>

            <section className="fc-pb-section">
              <h2 className="fc-pb-label">What your agent does</h2>
              <ol className="fc-pb-steps">
                {p.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>

            <section className="fc-pb-section">
              <h2 className="fc-pb-label">Prompt</h2>
              <p className="fc-sect-note">Paste it into your agent chat and add what you have.</p>
              <PromptBlock text={prompt} primary />
            </section>
          </div>

          <aside className="fc-pb-side">
            <SideBlock title="What you need">
              {groupNeeds(p.needs).map((g) => (
                <div key={g.where} className="fc-pb-group">
                  <div className="fc-pb-sublabel">{g.label}</div>
                  <ul className="fc-pb-needs">
                    {g.needs.map((n) => (
                      <NeedLine key={n.name} need={n} />
                    ))}
                  </ul>
                </div>
              ))}
              <p className="fc-pb-note">{projectLabel(p.project)}</p>
            </SideBlock>

            <SideBlock title="Style">
              {predicate ? (
                <>
                  <p className="fc-pb-style">Your style {predicate}</p>
                  {featured.length > 0 && (
                    <p className="fc-pb-note">
                      Made for this playbook:{" "}
                      {featured.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && ", "}
                          <Link to={`/styles/${s.id}`}>{styleNames[s.id]}</Link>
                        </span>
                      ))}
                      . Any other style works too.
                    </p>
                  )}
                  <Link to="/styles" className="fc-pb-var empty">
                    Browse styles <ChevronRight className="fc-i xs" aria-hidden />
                  </Link>
                </>
              ) : (
                <p className="fc-pb-note">This playbook has its own look. Styles aren&apos;t used.</p>
              )}
            </SideBlock>

            <SideBlock title="Made by">
              <p className="fc-pb-made">
                {p.creator.url ? (
                  <a href={p.creator.url} target="_blank" rel="noreferrer">
                    {p.creator.name}
                    <ArrowUpRight className="fc-i xs" aria-hidden />
                  </a>
                ) : (
                  <span>{p.creator.name}</span>
                )}
                {p.inspiredBy?.length ? (
                  <span className="muted">
                    {" · Inspired by "}
                    {p.inspiredBy.map((i, n) => (
                      <span key={i.name}>
                        {n > 0 && ", "}
                        {i.url ? (
                          <a href={i.url} target="_blank" rel="noreferrer">
                            {i.name}
                          </a>
                        ) : (
                          i.name
                        )}
                      </span>
                    ))}
                  </span>
                ) : null}
                {p.license && <span className="muted"> · {p.license} license</span>}
              </p>
            </SideBlock>
          </aside>
        </div>
      </main>
    </div>
  );
}

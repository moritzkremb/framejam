import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { BackHeader } from "@/components/header";
import { PromptBlock } from "@/components/setup-steps";
import { NotHere } from "@/components/states";
import { api, copyText, type PlaybookSummary } from "@/lib/api";
import { usePlaybookSelection } from "@/lib/use-playbook";
import { cn } from "@/lib/utils";
import { costBadge, groupNeeds, needLabel, playbookPrompt, projectLabel, stylesSentence } from "../../shared/playbooks";

async function copy(text: string, what: string) {
  try {
    await copyText(text);
    toast.success(`Copied ${what}`);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="fc-sect">
      <header>
        <h2 className="fc-h2">{title}</h2>
        {hint && <span className="fc-caption">{hint}</span>}
      </header>
      {children}
    </section>
  );
}

export function PlaybookDetailPage() {
  const { id = "" } = useParams();
  const [data, setData] = useState<{ playbook: PlaybookSummary; selected: string | null } | null>(null);
  const [styleName, setStyleName] = useState<string>();
  const [missing, setMissing] = useState(false);
  const selection = usePlaybookSelection(null);
  const { setSelected } = selection;

  useEffect(() => {
    setData(null);
    api
      .playbook(id)
      .then((d) => {
        setData(d);
        setSelected(d.selected);
      })
      .catch(() => setMissing(true));
    api
      .presets()
      .then(({ selected, presets }) => setStyleName(presets.find((p) => p.id === selected)?.name))
      .catch(() => {});
  }, [id, setSelected]);

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
  const inUse = selection.selected === p.id;
  const prompt = playbookPrompt(p);

  return (
    <div className="fc-screen">
      <BackHeader to="/playbooks" title={p.name} sub={`Playbook · by ${p.creator.name}`} />
      <main className="fc-main fc-style-page">
        <div className={cn("fc-style-media", p.format === "9:16" && "tall")}>
          {p.previewUrl ? (
            <video src={p.previewUrl} poster={p.posterUrl} autoPlay muted loop playsInline controls />
          ) : p.posterUrl ? (
            <img src={p.posterUrl} alt="" />
          ) : (
            <div className="fc-style-nopreview" style={{ aspectRatio: "16 / 9" }}>
              No example video for this playbook yet. Add a preview.mp4 to its folder.
            </div>
          )}
        </div>

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
            <button type="button" className="fc-btn outline" onClick={() => void copy(prompt, "prompt for your agent")}>
              <Copy className="fc-i sm" /> Copy prompt
            </button>
            <button
              type="button"
              data-testid="use-playbook"
              className={cn("fc-btn", inUse ? "" : "primary")}
              disabled={selection.busy === p.id}
              onClick={() => void selection.toggle(p)}
              title={inUse ? "Click to stop using this playbook" : undefined}
            >
              <Check className="fc-i sm" />
              {inUse ? "In use" : "Use this playbook"}
            </button>
          </div>
        </div>

        <div className="fc-sects">
          <p className="fc-style-desc">{p.description}</p>
          <div className="fc-two">
            <Section title="You bring">
              <ul className="fc-list">
                {p.bring.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Section>
            <Section title="You get">
              <p className="fc-sect-note">{p.get}</p>
            </Section>
          </div>
          <Section title="What you need">
            <div className="fc-col" style={{ gap: 12 }}>
              {groupNeeds(p.needs).map((g) => (
                <div key={g.where}>
                  <div className="fc-caption" style={{ marginBottom: 4 }}>
                    {g.label}
                  </div>
                  <ul className="fc-list">
                    {g.needs.map((n) => (
                      <li key={n.name}>{needLabel(n)}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="fc-sect-note">{projectLabel(p.project)}</p>
            </div>
          </Section>
          <Section title="Styles">
            <p className="fc-sect-note">{stylesSentence(p, styleName)}</p>
          </Section>
          <Section title="Steps" hint="What your agent does">
            <ol className="fc-list">
              {p.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </Section>
          <Section title="Prompt" hint="Paste into your agent chat and add what you have">
            <PromptBlock text={prompt} primary />
          </Section>
          <Section title="Made by">
            <div className="fc-col" style={{ gap: 6 }}>
              <p className="fc-sect-note">
                {p.creator.url ? (
                  <a href={p.creator.url} target="_blank" rel="noreferrer">
                    {p.creator.name} <ArrowUpRight className="fc-i xs" aria-hidden />
                  </a>
                ) : (
                  p.creator.name
                )}
                {p.license ? ` · ${p.license} license` : ""}
              </p>
              {p.inspiredBy?.length ? (
                <p className="fc-sect-note">
                  Inspired by{" "}
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
                </p>
              ) : null}
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}

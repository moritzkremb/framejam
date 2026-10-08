import { gsap } from "gsap";
import { Check, Copy, MoreHorizontal, RotateCcw, Type, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { BackHeader } from "@/components/header";
import { Menu, MenuItem } from "@/components/menu";
import { CodeBlock, PromptBlock } from "@/components/setup-steps";
import { NotHere } from "@/components/states";
import { api, copyText, type PresetSummary } from "@/lib/api";
import { useStyleSelection } from "@/lib/use-style";
import { cn } from "@/lib/utils";

type Tab = "overview" | "motion" | "agent";
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** "blobA" → "Blob A", "accentSoft" → "Accent soft". */
const label = (s: string) => cap(s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ ([A-Z])([a-z])/g, (_, a, b) => ` ${a.toLowerCase()}${b}`));

async function copy(text: string, what: string) {
  try {
    await copyText(text);
    toast.success(`Copied ${what}`);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

/** Loads Google-hosted preset fonts so the type specimens render in the real face. */
function useGoogleFonts(fonts: PresetSummary["fonts"] | undefined) {
  useEffect(() => {
    if (!fonts) return;
    const families = [...new Set(Object.values(fonts).filter((f) => /google/i.test(f.source ?? "")).map((f) => f.family))];
    if (!families.length) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800;900`).join("&")}&display=swap`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [fonts]);
}

/** Splits "power2.out (yoyo)" into a GSAP ease and a note. */
function splitEase(value: string): { ease: string; note?: string } {
  const m = value.match(/^\s*([a-zA-Z0-9]+(?:\.[a-zA-Z]+)?(?:\([^)]*\))?)\s*(.*)$/);
  if (!m) return { ease: value };
  const note = m[2].replace(/^[/(]\s*|\)$/g, "").trim();
  return { ease: m[1], note: note || undefined };
}

function EaseCurve({ ease }: { ease: string }) {
  const path = useMemo(() => {
    let fn: ((t: number) => number) | undefined;
    try {
      fn = gsap.parseEase(ease.replace(/\(([\d.]+)[–-][\d.]+\)/, "($1)")) as ((t: number) => number) | undefined;
    } catch {
      fn = undefined;
    }
    if (typeof fn !== "function") return null;
    const pts = Array.from({ length: 61 }, (_, i) => [i / 60, fn!(i / 60)] as const);
    const ys = pts.map((p) => p[1]);
    const lo = Math.min(0, ...ys);
    const hi = Math.max(1, ...ys);
    const W = 120;
    const H = 72;
    const pad = 8;
    const sx = (x: number) => pad + x * (W - 2 * pad);
    const sy = (y: number) => H - pad - ((y - lo) / (hi - lo)) * (H - 2 * pad);
    return {
      d: pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" "),
      base: sy(0),
      top: sy(1),
    };
  }, [ease]);
  return (
    <svg className="fc-curve" viewBox="0 0 120 72" aria-hidden>
      {path && (
        <>
          <line x1="8" x2="112" y1={path.base} y2={path.base} className="g" />
          <line x1="8" x2="112" y1={path.top} y2={path.top} className="g" />
          <path d={path.d} />
        </>
      )}
    </svg>
  );
}

function Section({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="fc-sect">
      <header>
        <h2 className="fc-h2">{title}</h2>
        {hint && <span className="fc-caption">{hint}</span>}
        <span className="fc-grow" />
        {action}
      </header>
      {children}
    </section>
  );
}

export function StyleDetailPage() {
  const { id = "" } = useParams();
  const [data, setData] = useState<{ preset: PresetSummary; selected: string | null; files: { path: string; content: string }[] } | null>(
    null,
  );
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [replay, setReplay] = useState(0);
  const selection = useStyleSelection(null);
  const { setSelected } = selection;
  useGoogleFonts(data?.preset.fonts);

  useEffect(() => {
    setData(null);
    api
      .preset(id)
      .then((d) => {
        setData(d);
        setSelected(d.selected);
      })
      .catch(() => setMissing(true));
  }, [id, setSelected]);

  if (missing) {
    return (
      <div className="fc-screen">
        <BackHeader to="/styles" title="Styles" />
        <main className="fc-main">
          <NotHere title="This style isn't here" message="It may have been removed from the library." back="/styles" backLabel="Back to styles" />
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fc-screen">
        <BackHeader to="/styles" title="Style" />
        <main className="fc-main fc-style-page">
          <div className="fc-skel" style={{ aspectRatio: "16 / 9", borderRadius: 14 }} />
          <div className="fc-skel" style={{ height: 120 }} />
        </main>
      </div>
    );
  }

  const { preset } = data;
  const inUse = selection.selected === preset.id;
  const vertical = preset.height > preset.width;
  const agentPrompt = `Use the look of the FrameJam style "${preset.name}" (id: ${preset.id}) for my video: call get_preset("${preset.id}") and use its colours, textures, type and motion. Build my own subject in it; don't copy the example scene. My video: `;
  const guideLines = preset.guide
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
  const textColor = preset.palette.text ?? preset.palette.foreground ?? Object.values(preset.palette)[1];
  const stats = [
    { k: "Average shot", v: `${preset.rhythm.averageShotSeconds}s` },
    preset.rhythm.holdAfterTextSeconds !== undefined ? { k: "Hold after text", v: `${preset.rhythm.holdAfterTextSeconds}s` } : null,
    { k: "Pace", v: cap(preset.pacing) },
    { k: "Length", v: `${preset.durationSeconds}s` },
  ].filter((s): s is { k: string; v: string } => Boolean(s));

  return (
    <div className="fc-screen">
      <BackHeader to="/styles" title={preset.name} sub={`Style · ${preset.format} · ${preset.durationSeconds}s`}>
        <Menu
          label="More"
          trigger={
            <button type="button" className="fc-btn ghost icon round" aria-label="More">
              <MoreHorizontal className="fc-i" />
            </button>
          }
        >
          <MenuItem icon={<RotateCcw className="fc-i sm" />} onSelect={() => setReplay((r) => r + 1)}>
            Replay preview
          </MenuItem>
          <MenuItem icon={<Copy className="fc-i sm" />} onSelect={() => void copy(preset.guide, "style guide")}>
            Copy style guide
          </MenuItem>
        </Menu>
      </BackHeader>
      <main className="fc-main fc-style-page">
        <div className={cn("fc-style-media", vertical && "tall")}>
          {preset.previewUrl ? (
            <video key={replay} src={preset.previewUrl} poster={preset.posterUrl} autoPlay muted loop playsInline controls />
          ) : preset.posterUrl ? (
            <img src={preset.posterUrl} alt="" />
          ) : (
            <div className="fc-style-nopreview" style={{ aspectRatio: `${preset.width} / ${preset.height}` }}>
              No preview video for this style yet. Add a preview.mp4 to its folder.
            </div>
          )}
        </div>

        <div className="fc-style-head">
          <div className="fc-grow">
            <h1 className="fc-h1">{preset.name}</h1>
            <p className="fc-lede">{preset.tagline}</p>
            <div className="fc-row" style={{ gap: 6, marginTop: 10 }}>
              <span className="fc-badge">{preset.format}</span>
              <span className="fc-badge">{cap(preset.pacing)} pace</span>
              {preset.mood.map((m) => (
                <span key={m} className="fc-badge">
                  {m}
                </span>
              ))}
            </div>
          </div>
          <div className="actions">
            <button type="button" className="fc-btn outline" onClick={() => void copy(agentPrompt, "prompt for your agent")}>
              <Copy className="fc-i sm" /> Copy prompt
            </button>
            <button
              type="button"
              data-testid="use-style"
              className={cn("fc-btn", inUse ? "" : "primary")}
              disabled={selection.busy === preset.id}
              onClick={() => void selection.toggle(preset)}
              title={inUse ? "Click to stop using this style" : undefined}
            >
              <Check className="fc-i sm" />
              {inUse ? "In use" : "Use this style"}
            </button>
          </div>
        </div>

        <nav className="fc-tabs" role="tablist">
          {(
            [
              ["overview", "Overview"],
              ["motion", "Motion"],
              ["agent", "For your agent"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className="fc-sects">
            <p className="fc-style-desc">{preset.description}</p>
            {preset.example && (
              <p className="fc-sect-note">
                <b>The example video:</b> {preset.example.replace(/\s*Don't copy this scene unless asked\.?$/, "")} Your agent uses the look, not this
                scene.
              </p>
            )}
            <Section title="Palette" hint="Click a colour to copy it">
              <div className="fc-palette">
                {Object.entries(preset.palette).map(([name, color]) => (
                  <button key={name} type="button" className="fc-chip-color" onClick={() => void copy(color, color)}>
                    <span className="c" style={{ background: color }} />
                    <span className="l">{label(name)}</span>
                    <span className="v">{color}</span>
                  </button>
                ))}
              </div>
            </Section>
            <Section title="Typography">
              <div className="fc-type-grid">
                {Object.entries(preset.fonts).map(([role, f]) => (
                  <div key={role} className="fc-type-card">
                    <div className="spec" style={{ fontFamily: `"${f.family}", var(--font-sans)`, fontWeight: f.weights?.at(-1) ?? 600, background: preset.palette.background, color: textColor }}>
                      Aa
                    </div>
                    <div className="info">
                      <div className="role">
                        <Type className="fc-i xs" /> {label(role)}
                      </div>
                      <div className="fam">{f.family}</div>
                      {f.weights?.length ? (
                        <div className="fc-row" style={{ gap: 4 }}>
                          {f.weights.map((w) => (
                            <span key={w} className="fc-badge">
                              {w}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {f.usage && <p className="use">{f.usage}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {tab === "motion" && (
          <div className="fc-sects">
            <Section title="Easing" hint="The curves your agent uses, by role">
              <div className="fc-ease-grid">
                {Object.entries(preset.easing).map(([role, value]) => {
                  const { ease, note } = splitEase(value);
                  return (
                    <button key={role} type="button" className="fc-ease" onClick={() => void copy(ease, ease)} title="Copy ease">
                      <EaseCurve ease={ease} />
                      <span className="role">{label(role)}</span>
                      <span className="v">{ease}</span>
                      {note && <span className="note">{note}</span>}
                    </button>
                  );
                })}
              </div>
            </Section>
            <div className="fc-two">
              <Section title="Transitions">
                <ul className="fc-list">
                  {preset.transitions.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </Section>
              <Section title="Text animations">
                <ul className="fc-list">
                  {preset.textAnimations.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </Section>
            </div>
            <Section title="Rhythm">
              <div className="fc-stats">
                {stats.map((s) => (
                  <div key={s.k} className="stat">
                    <span className="v">{s.v}</span>
                    <span className="k">{s.k}</span>
                  </div>
                ))}
              </div>
              {preset.rhythm.notes && <p className="fc-sect-note">{preset.rhythm.notes}</p>}
            </Section>
          </div>
        )}

        {tab === "agent" && (
          <div className="fc-sects">
            <Section title="Prompt" hint="Paste into your agent chat and say what your video is about">
              <PromptBlock text={agentPrompt} primary />
            </Section>
            <Section
              title="Style guide"
              hint="What your agent follows"
              action={
                <button type="button" className="fc-btn ghost sm" onClick={() => void copy(preset.guide, "style guide")}>
                  <Copy className="fc-i xs" /> Copy
                </button>
              }
            >
              <ol className="fc-guide-list">
                {guideLines.map((l, i) => (
                  <li key={i}>
                    <Wand2 className="fc-i xs" />
                    <span>{l}</span>
                  </li>
                ))}
              </ol>
            </Section>
            <Section title="Example files" hint="The example video as a Hyperframes project. Your agent only looks here to see how a technique is built">
              <div className="fc-col" style={{ gap: 8 }}>
                {data.files.map((f) => (
                  <details key={f.path} className="fc-file">
                    <summary>
                      <span className="fc-time">{f.path}</span>
                      <span className="fc-grow" />
                      <span className="fc-caption">{(f.content.length / 1024).toFixed(1)} KB</span>
                    </summary>
                    <CodeBlock code={f.content} block />
                  </details>
                ))}
              </div>
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}

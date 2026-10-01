import { Check, Copy, MoreHorizontal, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { BackHeader } from "@/components/header";
import { Menu, MenuItem } from "@/components/menu";
import { CodeBlock } from "@/components/setup-steps";
import { NotHere } from "@/components/states";
import { api, copyText, type PresetSummary } from "@/lib/api";
import { useStyleSelection } from "@/lib/use-style";
import { cn } from "@/lib/utils";

type Tab = "overview" | "motion" | "agent";
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function LivePreview({ url, width, height }: { url: string; width: number; height: number }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => setScale(box.clientWidth / width));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box, width]);
  return (
    <div ref={setBox} className="fc-live-preview" style={{ aspectRatio: `${width} / ${height}` }}>
      {scale > 0 && (
        <iframe
          title="Style preview"
          src={url}
          style={{ width, height, transform: `scale(${scale})` }}
          onLoad={(e) => {
            const win = e.currentTarget.contentWindow as (Window & { __player?: { play(): void }; __playerReady?: boolean }) | null;
            const start = Date.now();
            const t = setInterval(() => {
              if (win?.__playerReady && win.__player) {
                win.__player.play();
                clearInterval(t);
              } else if (Date.now() - start > 5000) clearInterval(t);
            }, 100);
          }}
        />
      )}
    </div>
  );
}

async function copy(text: string, what: string) {
  try {
    await copyText(text);
    toast.success(`Copied ${what}`);
  } catch (e) {
    toast.error((e as Error).message);
  }
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
        <main className="fc-main">
          <div className="fc-skel" style={{ aspectRatio: "16 / 9", borderRadius: 14 }} />
          <div className="fc-skel" style={{ height: 120 }} />
        </main>
      </div>
    );
  }

  const { preset } = data;
  const inUse = selection.selected === preset.id;
  const vertical = preset.height > preset.width;
  const agentPrompt = `Use the Frame Jam style "${preset.name}" (id: ${preset.id}). Call get_preset("${preset.id}") and follow its style guide, palette, fonts and easing when building the Hyperframes composition.`;

  return (
    <div className="fc-screen fc-has-dock">
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
      <main className="fc-main">
        <div className={cn("fc-style-media", vertical && "tall")}>
          {preset.previewUrl ? (
            <video
              key={replay}
              src={preset.previewUrl}
              poster={preset.posterUrl}
              autoPlay
              muted
              loop
              playsInline
              controls
            />
          ) : (
            <LivePreview key={replay} url={preset.compositionUrl} width={preset.width} height={preset.height} />
          )}
        </div>
        <div>
          <h1 className="fc-h1">{preset.name}</h1>
          <p className="fc-lede" style={{ margin: "6px 0 10px", fontSize: 14 }}>
            {preset.tagline}
          </p>
          <div className="fc-row" style={{ gap: 6 }}>
            <span className="fc-badge">{preset.format}</span>
            <span className="fc-badge">{cap(preset.pacing)} pace</span>
            {preset.mood.map((m) => (
              <span key={m} className="fc-badge">
                {m}
              </span>
            ))}
          </div>
        </div>
        <nav className="fc-tabs" role="tablist">
          {(
            [
              ["overview", "Overview"],
              ["motion", "Motion"],
              ["agent", "For your agent"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className="fc-col" style={{ gap: 20 }}>
            <p style={{ margin: 0, color: "var(--text-2)" }}>{preset.description}</p>
            <section>
              <div className="fc-sec-h">
                <span className="fc-h3">Colours</span>
                <span className="fc-grow" />
                <span className="fc-caption">Click to copy</span>
              </div>
              <div className="fc-swatches">
                {Object.entries(preset.palette).map(([name, color]) => (
                  <button key={name} type="button" className="fc-swatch" onClick={() => void copy(color, color)}>
                    <span className="c" style={{ background: color }} />
                    <span>
                      <div className="l">{cap(name)}</div>
                      <div className="v">{color}</div>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <div className="fc-sec-h">
                <span className="fc-h3">Type</span>
              </div>
              <dl className="fc-kv">
                {Object.entries(preset.fonts).map(([role, f]) => (
                  <div key={role} className="fc-kv-row">
                    <dt>{cap(role)}</dt>
                    <dd>
                      {f.family}
                      {f.weights?.length ? ` · ${f.weights.join("/")}` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        )}

        {tab === "motion" && (
          <div className="fc-col" style={{ gap: 20 }}>
            <section>
              <div className="fc-sec-h">
                <span className="fc-h3">Easing</span>
              </div>
              <dl className="fc-kv">
                {Object.entries(preset.easing).map(([k, v]) => (
                  <div key={k} className="fc-kv-row">
                    <dt>{cap(k)}</dt>
                    <dd className="fc-time">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section>
              <div className="fc-sec-h">
                <span className="fc-h3">Transitions and text</span>
              </div>
              <div className="fc-row" style={{ gap: 6 }}>
                {[...preset.transitions, ...preset.textAnimations].map((t) => (
                  <span key={t} className="fc-badge">
                    {t}
                  </span>
                ))}
              </div>
            </section>
            <p className="fc-caption" style={{ margin: 0 }}>
              Average shot {preset.rhythm.averageShotSeconds}s{preset.rhythm.notes ? `. ${preset.rhythm.notes}` : ""}
            </p>
          </div>
        )}

        {tab === "agent" && (
          <div className="fc-col" style={{ gap: 20 }}>
            <section>
              <div className="fc-sec-h">
                <span className="fc-h3">Style guide</span>
                <span className="fc-grow" />
                <button type="button" className="fc-btn ghost sm" onClick={() => void copy(preset.guide, "style guide")}>
                  <Copy className="fc-i xs" /> Copy
                </button>
              </div>
              <div className="fc-guide">{preset.guide}</div>
            </section>
            <section>
              <div className="fc-sec-h">
                <span className="fc-h3">Template files</span>
              </div>
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
            </section>
          </div>
        )}
      </main>
      <div className="fc-dock">
        <div className="send" style={{ margin: 0 }}>
          <button type="button" className="fc-btn outline lg" onClick={() => void copy(agentPrompt, "prompt for your agent")}>
            <Copy className="fc-i sm" /> Copy prompt
          </button>
          <button
            type="button"
            data-testid="use-style"
            className={cn("fc-btn lg fc-grow", inUse ? "" : "primary")}
            disabled={selection.busy === preset.id}
            onClick={() => void selection.toggle(preset)}
          >
            <Check className="fc-i sm" />
            {inUse ? "In use · tap to stop using" : "Use this style"}
          </button>
        </div>
      </div>
    </div>
  );
}

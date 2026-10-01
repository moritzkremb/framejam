import { Check, ChevronLeft, Code2, Film, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CopyButton } from "@/components/connect-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type PresetSummary } from "@/lib/api";
import { NotFoundPage } from "./not-found-page";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </div>
  );
}

export function PresetDetailPage() {
  const { id = "" } = useParams();
  const [data, setData] = useState<{ preset: PresetSummary; selected: string | null; files: { path: string; content: string }[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(null);
    api
      .preset(id)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <NotFoundPage message="That preset doesn't exist." />;
  if (!data) {
    return (
      <div className="mx-auto grid max-w-[1400px] gap-6 p-5 lg:grid-cols-[1fr_400px]">
        <Skeleton className="aspect-video rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const { preset } = data;
  const isSelected = data.selected === preset.id;
  const vertical = preset.format === "9:16";
  const agentPrompt = `Use the framecut style preset "${preset.name}" (id: ${preset.id}). Call get_preset("${preset.id}") and follow its style guide, palette, fonts and easing when building the Hyperframes composition.`;

  const toggleSelect = async () => {
    setSaving(true);
    try {
      const next = await api.selectPreset(isSelected ? null : preset.id);
      setData({ ...data, selected: next?.id ?? null });
      window.dispatchEvent(new Event("framecut:preset-selected"));
      toast.success(isSelected ? "Style cleared" : `${preset.name} selected`, {
        description: isSelected ? undefined : "Your agent will get it from get_selected_preset.",
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
      <Link to="/presets" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> All presets
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0">
          <Tabs defaultValue={preset.previewUrl ? "render" : "live"}>
            <TabsList className="mb-3">
              <TabsTrigger value="render" disabled={!preset.previewUrl} className="gap-1.5 text-xs">
                <Film className="size-3.5" /> Preview render
              </TabsTrigger>
              <TabsTrigger value="live" className="gap-1.5 text-xs">
                <Code2 className="size-3.5" /> Live composition
              </TabsTrigger>
            </TabsList>
            <TabsContent value="render">
              <div className="grid place-items-center overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
                {preset.previewUrl && (
                  <video
                    src={preset.previewUrl}
                    poster={preset.posterUrl}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    className={vertical ? "max-h-[70vh]" : "w-full"}
                  />
                )}
              </div>
            </TabsContent>
            <TabsContent value="live">
              <LivePreview url={preset.compositionUrl} width={preset.width} height={preset.height} />
            </TabsContent>
          </Tabs>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Section title="Style guide for the agent">
              <div className="rounded-xl border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {preset.guide}
              </div>
            </Section>
            <Section title="Template source">
              <div className="space-y-2">
                {data.files.map((f) => (
                  <details key={f.path} className="group rounded-xl border bg-card">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-mono text-xs">
                      {f.path}
                      <span className="ml-auto text-muted-foreground">{(f.content.length / 1024).toFixed(1)} KB</span>
                    </summary>
                    <div className="relative border-t">
                      <div className="absolute top-1.5 right-1.5">
                        <CopyButton text={f.content} />
                      </div>
                      <pre className="max-h-96 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">{f.content}</pre>
                    </div>
                  </details>
                ))}
              </div>
            </Section>
          </div>
        </div>

        <aside className="flex flex-col gap-5">
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{preset.format}</Badge>
              <Badge variant="secondary" className="capitalize">
                {preset.pacing} pacing
              </Badge>
              <Badge variant="secondary">{preset.durationSeconds}s</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">{preset.name}</h1>
            <p className="mt-1 text-muted-foreground">{preset.tagline}</p>
            <p className="mt-3 text-sm leading-relaxed">{preset.description}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button data-testid="use-style" size="lg" variant={isSelected ? "secondary" : "default"} className="gap-2" onClick={toggleSelect} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : isSelected ? <Check className="size-4" /> : <Sparkles className="size-4" />}
              {isSelected ? "Selected — click to clear" : "Use this style"}
            </Button>
            <div className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs text-muted-foreground">
              Or paste this into your agent chat
              <CopyButton text={agentPrompt} label="Copy prompt" />
            </div>
          </div>

          <Section title="Palette">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(preset.palette).map(([name, color]) => (
                <button
                  key={name}
                  type="button"
                  className="overflow-hidden rounded-lg border text-left"
                  onClick={() => {
                    void navigator.clipboard.writeText(color).then(() => toast(`Copied ${color}`));
                  }}
                >
                  <div className="h-10" style={{ background: color }} />
                  <div className="px-2 py-1">
                    <div className="text-[11px]">{name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{color}</div>
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Type">
            <ul className="space-y-1.5 text-sm">
              {Object.entries(preset.fonts).map(([role, f]) => (
                <li key={role} className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2">
                  <span className="text-xs text-muted-foreground capitalize">{role}</span>
                  <span className="text-right">
                    {f.family}
                    {f.weights?.length ? <span className="text-muted-foreground"> · {f.weights.join("/")}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Motion">
            <ul className="space-y-1.5 font-mono text-xs">
              {Object.entries(preset.easing).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3 rounded-lg border px-3 py-1.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Transitions & text animation">
            <div className="flex flex-wrap gap-1.5">
              {[...preset.transitions, ...preset.textAnimations].map((t) => (
                <span key={t} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Average shot {preset.rhythm.averageShotSeconds}s{preset.rhythm.notes ? ` — ${preset.rhythm.notes}` : ""}
            </p>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function LivePreview({ url, width, height }: { url: string; width: number; height: number }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => setScale(box.clientWidth / width));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box, width]);
  const vertical = height > width;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={setBox}
        className="relative overflow-hidden rounded-xl bg-black ring-1 ring-white/10"
        style={{ width: vertical ? `min(100%, calc(70vh * ${width / height}))` : "100%", aspectRatio: `${width} / ${height}` }}
      >
        {scale > 0 && (
          <iframe
            key={key}
            title="Live composition"
            src={url}
            className="absolute top-0 left-0 origin-top-left border-0"
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
      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setKey((k) => k + 1)}>
        Replay
      </Button>
    </div>
  );
}

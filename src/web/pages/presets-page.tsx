import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type PresetSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

function PresetCard({ preset, selected }: { preset: PresetSummary; selected: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <Link
      to={`/presets/${preset.id}`}
      data-testid="preset-card"
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:border-white/25 hover:shadow-xl",
        selected && "border-primary/70 ring-1 ring-primary/40",
      )}
      onMouseEnter={() => void videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = videoRef.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
    >
      <div className="relative grid aspect-video place-items-center overflow-hidden bg-black" style={{ background: preset.palette.background }}>
        {preset.previewUrl ? (
          <video
            ref={videoRef}
            src={preset.previewUrl}
            poster={preset.posterUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className={cn("absolute inset-0 size-full", preset.format === "16:9" ? "object-cover" : "object-contain")}
          />
        ) : preset.posterUrl ? (
          <img src={preset.posterUrl} alt="" className="absolute inset-0 size-full object-contain" />
        ) : (
          <span className="text-sm" style={{ color: preset.palette.text }}>
            {preset.name}
          </span>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge className="bg-black/60 text-[10px] text-white backdrop-blur">{preset.format}</Badge>
          <Badge className="bg-black/60 text-[10px] text-white capitalize backdrop-blur">{preset.pacing}</Badge>
        </div>
        {selected && (
          <Badge className="absolute top-2 right-2 gap-1 text-[10px]">
            <Check className="size-3" /> Selected
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{preset.name}</h3>
          <div className="ml-auto flex -space-x-1">
            {Object.values(preset.palette)
              .slice(0, 5)
              .map((c, i) => (
                <span key={i} className="size-3.5 rounded-full ring-2 ring-card" style={{ background: c }} />
              ))}
          </div>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{preset.tagline}</p>
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {preset.mood.map((m) => (
            <span key={m} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              {m}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export function PresetsPage() {
  const [data, setData] = useState<{ selected: string | null; presets: PresetSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState("all");
  const [pacing, setPacing] = useState("all");
  const [mood, setMood] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .presets()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const moods = useMemo(() => [...new Set(data?.presets.flatMap((p) => p.mood) ?? [])].sort(), [data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.presets ?? []).filter(
      (p) =>
        (format === "all" || p.format === format) &&
        (pacing === "all" || p.pacing === pacing) &&
        (!mood || p.mood.includes(mood)) &&
        (!q || [p.name, p.tagline, p.description, ...p.mood, ...(p.tags ?? [])].join(" ").toLowerCase().includes(q)),
    );
  }, [data, format, pacing, mood, query]);

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-5">
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Style presets</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Hover to play. Open one and press <span className="text-foreground">Use this style</span> — your agent gets the
          exact palette, fonts, easing, transitions and a working Hyperframes template via{" "}
          <code className="text-xs">get_selected_preset</code>.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-64">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search styles" className="h-8 pl-8" />
        </div>
        <ToggleGroup type="single" size="sm" variant="outline" value={format} onValueChange={(v) => setFormat(v || "all")}>
          {["all", "16:9", "9:16", "1:1"].map((f) => (
            <ToggleGroupItem key={f} value={f} className="px-2.5 text-xs capitalize">
              {f}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup type="single" size="sm" variant="outline" value={pacing} onValueChange={(v) => setPacing(v || "all")}>
          {["all", "slow", "medium", "fast"].map((f) => (
            <ToggleGroupItem key={f} value={f} className="px-2.5 text-xs capitalize">
              {f === "all" ? "Any pace" : f}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap gap-1.5">
          {moods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(mood === m ? null : m)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                mood === m ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">Couldn't load presets: {error}</div>}

      {!data && !error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      )}

      {data && visible.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No presets match these filters.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((p) => (
          <PresetCard key={p.id} preset={p} selected={data?.selected === p.id} />
        ))}
      </div>
    </div>
  );
}

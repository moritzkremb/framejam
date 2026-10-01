import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Film,
  Keyboard,
  MessageSquarePlus,
  Pause,
  Play,
  SkipBack,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CommentPanel, Composer, type CommentFilter, type Draft } from "@/components/review/comment-panel";
import { Stage, type MediaController } from "@/components/review/stage";
import { Timeline } from "@/components/review/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, compositionUrl, formatTime, videoUrl, type Review, type ReviewComment } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NotFoundPage } from "./not-found-page";

const FPS = 30;

export function ReviewPage() {
  const { id = "" } = useParams();
  const [review, setReview] = useState<Review | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [source, setSource] = useState<"video" | "live">("video");
  const [ctrl, setCtrl] = useState<MediaController | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CommentFilter>("open");
  const resumeTime = useRef(0);
  const knownVersions = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await api.review(id);
      setReview(r);
      setLoadError(null);
      const latest = r.versions.at(-1)!.number;
      if (knownVersions.current && latest > knownVersions.current) {
        toast.success(`Version ${latest} is ready`, {
          description: r.versions.at(-1)!.note ?? "Your agent attached a new render.",
          action: { label: "View", onClick: () => setActiveVersion(latest) },
        });
      }
      knownVersions.current = latest;
      setActiveVersion((v) => v ?? latest);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    knownVersions.current = 0;
    setReview(null);
    setActiveVersion(null);
    void load();
    const es = new EventSource(`/api/reviews/${id}/events`);
    es.addEventListener("changed", () => void load());
    return () => es.close();
  }, [id, load]);

  const version = review?.versions.find((v) => v.number === activeVersion) ?? review?.versions.at(-1);
  const hasVideo = Boolean(version?.videoPath);
  const hasLive = Boolean(version?.compositionDir);

  useEffect(() => {
    if (!version) return;
    if (source === "video" && !hasVideo) setSource("live");
    if (source === "live" && !hasLive) setSource("video");
  }, [version, source, hasVideo, hasLive]);

  // Poll the active controller for time/playing state.
  useEffect(() => {
    if (!ctrl) return;
    let raf = 0;
    const loop = () => {
      setTime(ctrl.getTime());
      setPlaying(ctrl.isPlaying());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ctrl]);

  const handleController = useCallback((c: MediaController | null) => {
    setCtrl((prev) => {
      if (prev) resumeTime.current = prev.getTime();
      return c;
    });
    if (c && resumeTime.current) c.seek(resumeTime.current);
  }, []);

  const duration = ctrl?.duration || 0;

  // Stable 1-based numbering by time across the whole review.
  const ordered = useMemo(
    () => [...(review?.comments ?? [])].sort((a, b) => a.version - b.version || a.time - b.time || a.createdAt.localeCompare(b.createdAt)),
    [review],
  );
  const indexOf = useCallback((cid: string) => ordered.findIndex((c) => c.id === cid) + 1, [ordered]);

  const relevant = useMemo(
    () => (review?.comments ?? []).filter((c) => c.version === version?.number || (c.status !== "resolved" && c.version < (version?.number ?? 0))),
    [review, version],
  );

  const pins = useMemo(
    () =>
      relevant
        .filter((c) => c.x !== undefined && !c.wholeVideo)
        .filter((c) =>
          c.endTime !== undefined ? time >= c.time - 0.05 && time <= c.endTime + 0.05 : Math.abs(time - c.time) < 0.75 || c.id === selectedId,
        )
        .map((c) => ({ comment: c, index: indexOf(c.id) })),
    [relevant, time, selectedId, indexOf],
  );

  const markers = useMemo(
    () =>
      relevant
        .filter((c) => !c.wholeVideo)
        .map((c) => ({ comment: c, index: indexOf(c.id), faded: c.version !== version?.number })),
    [relevant, version, indexOf],
  );

  const pause = () => ctrl?.pause();

  const startDraft = useCallback(
    (partial: Omit<Draft, "time"> & { time?: number }) => {
      if (!ctrl) return;
      ctrl.pause();
      const t = partial.time ?? ctrl.getTime();
      const thumbnailDataUrl = ctrl.kind === "video" && partial.endTime === undefined ? ctrl.captureFrame?.() : undefined;
      setDraft({ ...partial, time: t, thumbnailDataUrl });
      setSelectedId(null);
    },
    [ctrl],
  );

  const onFrameClick = (x: number, y: number) => {
    if (!ctrl) return;
    ctrl.pause();
    const t = ctrl.getTime();
    const element = ctrl.resolveAt?.(x, y, t);
    startDraft({ x, y, element, time: t });
  };

  const seek = (t: number) => {
    ctrl?.seek(t);
    setTime(t);
  };

  const step = (frames: number) => {
    if (!ctrl) return;
    ctrl.pause();
    seek(Math.max(0, Math.min(duration, ctrl.getTime() + frames / FPS)));
  };

  const selectComment = (c: ReviewComment) => {
    setSelectedId(c.id);
    if (c.version !== version?.number && review?.versions.some((v) => v.number === c.version)) {
      resumeTime.current = c.time;
      setActiveVersion(c.version);
    }
    if (!c.wholeVideo) {
      ctrl?.pause();
      seek(c.time);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        if (!ctrl) return;
        if (ctrl.isPlaying()) ctrl.pause();
        else {
          setDraft(null);
          ctrl.play();
        }
      } else if (e.key === "ArrowLeft" || e.key === ",") {
        e.preventDefault();
        step(e.shiftKey ? -FPS : -1);
      } else if (e.key === "ArrowRight" || e.key === ".") {
        e.preventDefault();
        step(e.shiftKey ? FPS : 1);
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        startDraft({});
      } else if (e.key === "Escape") {
        setDraft(null);
        setSelectedId(null);
      } else if ((e.key === "v" || e.key === "V") && review && review.versions.length > 1) {
        const latest = review.versions.at(-1)!.number;
        setActiveVersion((v) => (v === latest ? latest - 1 : latest));
      } else if (e.key === "l" || e.key === "L") {
        if (hasVideo && hasLive) setSource((s) => (s === "video" ? "live" : "video"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loadError && !review) {
    return <NotFoundPage message={loadError.includes("not found") ? "This review doesn't exist (or was deleted)." : loadError} />;
  }

  if (!review || !version) {
    return (
      <div className="mx-auto grid max-w-[1600px] gap-4 p-5 lg:grid-cols-[1fr_380px]">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const src = source === "video" ? videoUrl(review.id, version.number) : compositionUrl(review.id, version.number);
  const latest = review.versions.at(-1)!.number;

  const addComment = async (text: string, wholeVideo: boolean) => {
    if (!draft) return;
    try {
      const c = await api.addComment(review.id, {
        version: version.number,
        time: draft.time,
        endTime: draft.endTime,
        x: wholeVideo ? undefined : draft.x,
        y: wholeVideo ? undefined : draft.y,
        wholeVideo,
        text,
        source,
        element: wholeVideo ? undefined : draft.element,
        thumbnailDataUrl: draft.thumbnailDataUrl,
      });
      setDraft(null);
      setSelectedId(c.id);
      setFilter((f) => (f === "resolved" ? "open" : f));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  };

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-4 sm:px-5 lg:h-[calc(100vh-3rem)] lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link to="/" className="text-muted-foreground hover:text-foreground" aria-label="Back to reviews">
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="truncate text-lg font-semibold tracking-tight">{review.title}</h1>
          {review.agentWaitingAt && (
            <Badge className="gap-1 bg-emerald-500/15 text-emerald-300">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Agent waiting
            </Badge>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={String(version.number)}
              onValueChange={(v) => v && setActiveVersion(Number(v))}
              aria-label="Version"
            >
              {review.versions.map((v) => (
                <Tooltip key={v.number}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value={String(v.number)} className="px-2.5 text-xs">
                      v{v.number}
                      {v.number === latest && review.versions.length > 1 && <span className="ml-1 size-1.5 rounded-full bg-primary" />}
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>{v.note ?? `Version ${v.number}`}</TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={source}
              onValueChange={(v) => v && setSource(v as "video" | "live")}
              aria-label="Player source"
            >
              <ToggleGroupItem value="video" disabled={!hasVideo} className="gap-1.5 px-2.5 text-xs">
                <Film className="size-3.5" /> Render
              </ToggleGroupItem>
              <ToggleGroupItem value="live" disabled={!hasLive} className="gap-1.5 px-2.5 text-xs" data-testid="source-live">
                <Code2 className="size-3.5" /> Live
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Stage */}
        <div className="min-h-[220px] flex-1 sm:min-h-[320px]">
          <Stage
            src={src}
            source={source}
            pins={pins}
            draft={draft}
            selectedId={selectedId}
            onController={handleController}
            onFrameClick={onFrameClick}
            onPinClick={(cid) => {
              const c = review.comments.find((x) => x.id === cid);
              if (c) selectComment(c);
            }}
          />
        </div>

        {/* Transport */}
        <div className="rounded-xl border bg-card/60 p-3">
          <div className="mb-2 flex items-center gap-1">
            <Button size="icon" variant="ghost" className="size-8" onClick={() => seek(0)} aria-label="Go to start">
              <SkipBack className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => step(-1)} aria-label="Previous frame">
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="icon"
              className="size-9 rounded-full"
              onClick={() => {
                if (!ctrl) return;
                if (playing) ctrl.pause();
                else {
                  setDraft(null);
                  ctrl.play();
                }
              }}
              aria-label={playing ? "Pause" : "Play"}
              disabled={!ctrl}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
            </Button>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => step(1)} aria-label="Next frame">
              <ChevronRight className="size-4" />
            </Button>
            <span className="ml-2 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              <span className="text-foreground">{formatTime(time)}</span> / {formatTime(duration)}
            </span>
            <span className="ml-2 hidden font-mono text-[11px] text-muted-foreground sm:inline">
              f{Math.round(time * FPS)}
            </span>
            {ctrl && ctrl.kind !== "video" && (
              <Badge variant="outline" className="ml-2 hidden text-[10px] md:inline-flex">
                {ctrl.kind === "hyperframes" ? "Hyperframes runtime" : "GSAP fallback"}
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="hidden size-8 text-muted-foreground sm:inline-flex" aria-label="Keyboard shortcuts">
                    <Keyboard className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs leading-relaxed">
                  Space play/pause · ←/→ frame · Shift+←/→ 1s
                  <br />C comment at playhead · V toggle versions · L render/live · Esc cancel
                </TooltipContent>
              </Tooltip>
              <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={() => startDraft({})} disabled={!ctrl}>
                <MessageSquarePlus className="size-3.5" /> <span className="hidden sm:inline">Comment</span>
                <kbd className="hidden rounded bg-black/30 px-1 text-[10px] sm:inline">C</kbd>
              </Button>
            </div>
          </div>
          <Timeline
            duration={duration}
            time={time}
            markers={markers}
            draftRange={draft ? { start: draft.time, end: draft.endTime } : null}
            selectedId={selectedId}
            onSeek={seek}
            onScrubStart={pause}
            onRange={(start, end) => {
              seek(start);
              startDraft({ time: start, endTime: end });
            }}
            onSelect={(cid) => {
              const c = review.comments.find((x) => x.id === cid);
              if (c) selectComment(c);
            }}
          />
        </div>
      </section>

      <aside
        className={cn(
          "flex min-h-[420px] flex-col rounded-xl border bg-card/30 p-3 lg:min-h-0 lg:w-[380px] lg:shrink-0",
          draft && "ring-1 ring-primary/30",
        )}
      >
        <CommentPanel
          reviewId={review.id}
          comments={review.comments}
          indexOf={indexOf}
          activeVersion={version.number}
          selectedId={selectedId}
          filter={filter}
          onFilter={setFilter}
          agentWaiting={Boolean(review.agentWaitingAt)}
          composer={draft ? <Composer draft={draft} onCancel={() => setDraft(null)} onSubmit={addComment} /> : null}
          onSelect={selectComment}
          onUpdate={async (c, patch) => {
            try {
              await api.updateComment(review.id, c.id, patch);
              await load();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
          onDelete={async (c) => {
            try {
              await api.deleteComment(review.id, c.id);
              await load();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
          onSend={async (message) => {
            try {
              const res = await api.submit(review.id, message);
              const n = res.batch.commentIds.length;
              toast.success(res.agentWaiting ? "Sent — your agent is on it" : "Sent to agent", {
                description: res.agentWaiting
                  ? `${n} comment${n === 1 ? "" : "s"} delivered to the waiting tool call.`
                  : `${n} comment${n === 1 ? "" : "s"} queued. Ask your agent to "apply my feedback", or it will pick them up on its next wait.`,
              });
              await load();
              return true;
            } catch (e) {
              toast.error((e as Error).message);
              return false;
            }
          }}
          onCopyPrompt={async () => {
            try {
              const text = await api.prompt(review.id);
              await navigator.clipboard.writeText(text);
              toast.success("Feedback copied as a prompt", { description: "Paste it into any agent chat." });
            } catch (e) {
              toast.error(`Couldn't copy: ${(e as Error).message}`);
            }
          }}
        />
      </aside>
    </div>
  );
}

import { ChevronLeft, ChevronRight, MessageSquarePlus, MousePointerClick, MoveHorizontal, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { BackHeader } from "@/components/header";
import { FeedbackDock, type Anchor } from "@/components/review/dock";
import { Filmstrip, type Marker } from "@/components/review/filmstrip";
import { Player, type FloatingNote, type MediaController, type Pin } from "@/components/review/player";
import { CommentsRail, ReviewBottom, ReviewHeader, ReviewSidebar, useSidebar } from "@/components/review/review-shell";
import { StoryboardReview } from "@/components/review/storyboard";
import { useReview, useWidth, type ReviewState } from "@/components/review/use-review";
import { isOffline, NotHere, Offline } from "@/components/states";
import { api, compositionUrl, formatTime, videoUrl, type ReviewComment } from "@/lib/api";
import { cn, FINISH_KEYS } from "@/lib/utils";

const FPS = 30;
const SHORTCUTS = `Space play/pause · ←/→ frame · Shift+←/→ 1s · C comment · W whole video · ${FINISH_KEYS} finish review · Esc clear`;
/** How long a comment without a range stays on screen after its timestamp. */
const POINT_VISIBLE_FOR = 1.5;

function aspectLabel(w: number, h: number) {
  const r = w / h;
  if (Math.abs(r - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(r - 9 / 16) < 0.05) return "9:16";
  if (Math.abs(r - 1) < 0.05) return "1:1";
  if (Math.abs(r - 4 / 5) < 0.05) return "4:5";
  return `${w}×${h}`;
}

/** Is the playhead at this comment? Ranges show for their span, point comments for a moment after. */
function isAt(c: ReviewComment, t: number) {
  if (c.wholeVideo) return false;
  if (c.endTime !== undefined) return t >= c.time - 0.05 && t <= c.endTime + 0.05;
  return t >= c.time - 0.15 && t <= c.time + POINT_VISIBLE_FOR;
}

/** Loads the review, then shows the video or storyboard view for the version on screen. */
export function ReviewPage() {
  const { id = "" } = useParams();
  const resumeTime = useRef(0);
  const r = useReview(id, () => {
    resumeTime.current = 0;
  });
  const { ref: rootRef, width } = useWidth<HTMLDivElement>();

  if (r.loadError && !r.review) {
    return (
      <div className="fc-rshell" ref={rootRef}>
        <BackHeader to="/" title="Project" />
        <main className="fc-main">
          {isOffline(r.loadError) ? (
            <Offline />
          ) : (
            <NotHere title="This project isn't here" message="It may have been deleted, or the link is from another computer." />
          )}
        </main>
      </div>
    );
  }

  if (!r.review || !r.version || !r.latest) {
    return (
      <div className="fc-rshell" ref={rootRef}>
        <BackHeader to="/" title="Loading project" />
        <main className="fc-main">
          <div className="fc-skel" style={{ aspectRatio: "16 / 9", borderRadius: 14 }} />
          <div className="fc-skel" style={{ height: 56 }} />
        </main>
      </div>
    );
  }

  return (
    <div className="fc-rshell" ref={rootRef}>
      {r.version.panels?.length ? <StoryboardReview r={r} width={width} /> : <VideoReview r={r} width={width} resumeTime={resumeTime} />}
    </div>
  );
}

function VideoReview({ r, width, resumeTime }: { r: ReviewState; width: number; resumeTime: MutableRefObject<number> }) {
  const review = r.review!;
  const version = r.version!;
  const latest = r.latest!;
  const { isLatest, isOpen, load } = r;
  const [ctrl, setCtrl] = useState<MediaController | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ kind: "time" });
  const [whole, setWhole] = useState(false);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const side = useSidebar(width);

  // Follow the playhead.
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

  const handleController = useCallback(
    (c: MediaController | null) => {
      setCtrl((prev) => {
        if (prev) resumeTime.current = prev.getTime();
        return c;
      });
      if (c && resumeTime.current) c.seek(Math.min(resumeTime.current, c.duration));
    },
    [resumeTime],
  );

  // Comments belong to the version they were written on.
  const comments = useMemo(
    () =>
      review.comments
        .filter((c) => c.version === version.number)
        .sort((a, b) => a.time - b.time || a.createdAt.localeCompare(b.createdAt)),
    [review, version],
  );
  const indexOf = useMemo(() => new Map(comments.map((c, i) => [c.id, i + 1])), [comments]);

  // Latest version plays live (so clicks hit exact elements); older versions play their render as it was.
  const source: "video" | "live" = isLatest ? (version.compositionDir ? "live" : "video") : version.videoPath ? "video" : "live";

  const duration = ctrl?.duration || 0;

  const here = comments.filter((c) => isAt(c, time));
  const pins: Pin[] = here
    .filter((c) => c.x !== undefined && c.y !== undefined)
    .map((c) => ({ id: c.id, index: indexOf.get(c.id)!, x: c.x!, y: c.y!, sent: c.status !== "draft", text: c.text }));
  const floating: FloatingNote[] = here
    .filter((c) => c.x === undefined || c.y === undefined)
    .map((c) => ({ id: c.id, index: indexOf.get(c.id)!, sent: c.status !== "draft", text: c.text }));

  const markers: Marker[] = comments.map((c) => ({ id: c.id, index: indexOf.get(c.id)!, time: c.time, endTime: c.endTime, whole: c.wholeVideo, sent: c.status !== "draft" }));

  const focusBox = () => requestAnimationFrame(() => boxRef.current?.focus());

  const seek = (t: number) => {
    ctrl?.seek(t);
    setTime(t);
  };

  const step = (frames: number) => {
    if (!ctrl) return;
    ctrl.pause();
    seek(Math.max(0, Math.min(duration, ctrl.getTime() + frames / FPS)));
  };

  const togglePlay = () => {
    if (!ctrl) return;
    if (ctrl.isPlaying()) ctrl.pause();
    else ctrl.play();
  };

  const selectComment = (c: ReviewComment, opts: { openSidebar?: boolean } = {}) => {
    setSelectedId(c.id);
    if (opts.openSidebar) side.setOpen(true);
    if (!c.wholeVideo) {
      ctrl?.pause();
      seek(c.time);
    }
  };
  const selectById = (cid: string) => {
    const c = review.comments.find((x) => x.id === cid);
    if (c) selectComment(c, { openSidebar: true });
  };

  const onFrameClick = (x: number, y: number) => {
    if (!ctrl || !isOpen) return;
    ctrl.pause();
    const t = ctrl.getTime();
    setAnchor({
      kind: "spot",
      time: t,
      x,
      y,
      element: ctrl.resolveAt?.(x, y, t),
      thumbnailDataUrl: ctrl.kind === "video" ? ctrl.captureFrame?.() : undefined,
    });
    setWhole(false);
    setSelectedId(null);
    if (side.overlay) side.setOpen(false);
    focusBox();
  };

  const addComment = async () => {
    if (!text.trim() || adding) return;
    setAdding(true);
    try {
      const t = anchor.kind === "time" ? (ctrl?.getTime() ?? time) : anchor.time;
      const c = await api.addComment(review.id, {
        version: version.number,
        time: t,
        endTime: !whole && anchor.kind === "range" ? anchor.endTime : undefined,
        x: !whole && anchor.kind === "spot" ? anchor.x : undefined,
        y: !whole && anchor.kind === "spot" ? anchor.y : undefined,
        wholeVideo: whole || undefined,
        text,
        source,
        element: !whole && anchor.kind === "spot" ? anchor.element : undefined,
        thumbnailDataUrl: anchor.kind === "spot" ? anchor.thumbnailDataUrl : ctrl?.kind === "video" ? ctrl.captureFrame?.() : undefined,
      });
      setText("");
      setAnchor({ kind: "time" });
      setWhole(false);
      setSelectedId(c.id);
      // Hand the keyboard back to the player so Space resumes playback.
      (document.activeElement as HTMLElement | null)?.blur();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const finish = async () => {
    if (text.trim()) await addComment();
    await r.finish();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === ",") {
        e.preventDefault();
        step(e.shiftKey ? -FPS : -1);
      } else if (e.key === "ArrowRight" || e.key === ".") {
        e.preventDefault();
        step(e.shiftKey ? FPS : 1);
      } else if ((e.key === "c" || e.key === "C") && isOpen) {
        e.preventDefault();
        ctrl?.pause();
        focusBox();
      } else if ((e.key === "w" || e.key === "W") && isOpen) {
        e.preventDefault();
        setWhole((on) => !on);
        focusBox();
      } else if (e.key === "Escape") {
        setAnchor({ kind: "time" });
        setSelectedId(null);
        if (side.overlay) side.setOpen(false);
      } else if (e.key === "?") {
        toast(SHORTCUTS);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const src = source === "video" ? videoUrl(review.id, version.number) : compositionUrl(review.id, version.number);
  const draftCount = comments.filter((c) => c.status === "draft").length;
  const subline = [
    review.versions.length > 1 ? `Version ${version.number} of ${review.versions.length}` : `Version ${version.number}`,
    duration ? formatTime(duration, false) : null,
    ctrl ? aspectLabel(ctrl.width, ctrl.height) : null,
    version.sentAt ? "review finished" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const pickVersion = (n: number) => {
    resumeTime.current = 0;
    setSelectedId(null);
    setAnchor({ kind: "time" });
    r.setActiveVersion(n);
  };

  const dock = (
    <FeedbackDock
      ref={boxRef}
      anchor={anchor}
      whole={whole}
      wholeKey="W"
      time={time}
      text={text}
      draftCount={draftCount}
      agentListening={Boolean(review.agentListening)}
      agentOutdated={Boolean(review.agentOutdated)}
      finishing={r.finishing}
      adding={adding}
      onText={setText}
      onClearAnchor={() => {
        setAnchor({ kind: "time" });
        focusBox();
      }}
      onWhole={(on) => {
        setWhole(on);
        focusBox();
      }}
      onAdd={() => void addComment()}
      onFinish={() => void finish()}
    />
  );

  const emptyState = (
    <div className="fc-side-empty">
      <div className="fc-h3">No comments yet</div>
      <p>Pause anywhere and type in the box under the timeline, or point at exactly what you mean:</p>
      <div className="fc-ways">
        <div>
          <MousePointerClick className="fc-i sm" /> Click the video to mark a spot
        </div>
        <div>
          <MoveHorizontal className="fc-i sm" /> Drag across the filmstrip for a range
        </div>
        <div>
          <MessageSquarePlus className="fc-i sm" /> Comment at the current time <span className="fc-kbd">C</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ReviewHeader r={r} subline={subline} shortcuts={SHORTCUTS} onPickVersion={pickVersion} />
      <div className={cn("fc-review", (!side.open || side.overlay) && "railed")}>
        <div className="fc-stage" style={{ "--content-w": `${Math.max(frameWidth, 520)}px` } as CSSProperties}>
          <Player
            src={src}
            source={source}
            pins={pins}
            floating={floating}
            newPin={isOpen && !whole && anchor.kind === "spot" ? anchor : null}
            selectedId={selectedId}
            showHint={isOpen && comments.length === 0 && anchor.kind === "time" && !playing}
            interactive={isOpen}
            style={{ flex: "0 1 auto", width: "100%", aspectRatio: `${ctrl ? ctrl.width / ctrl.height : 16 / 9}`, minHeight: 160 }}
            onController={handleController}
            onFrameClick={onFrameClick}
            onPinClick={selectById}
            onFrameWidth={setFrameWidth}
          />
          <div>
            <div className="fc-controls">
              <button type="button" className="fc-play" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay} disabled={!ctrl}>
                {playing ? <Pause className="fc-i fill" /> : <Play className="fc-i fill" />}
              </button>
              <span className="fc-readout">
                {formatTime(time)} <span>/ {formatTime(duration)}</span>
              </span>
              <span className="fc-grow" />
              <button type="button" className="fc-btn ghost icon sm round" aria-label="Previous frame" onClick={() => step(-1)}>
                <ChevronLeft className="fc-i sm" />
              </button>
              <button type="button" className="fc-btn ghost icon sm round" aria-label="Next frame" onClick={() => step(1)}>
                <ChevronRight className="fc-i sm" />
              </button>
            </div>
            <Filmstrip
              duration={duration}
              time={time}
              markers={markers}
              range={isOpen && !whole && anchor.kind === "range" ? { start: anchor.time, end: anchor.endTime } : null}
              selectedId={selectedId}
              frameSource={version.videoPath ? videoUrl(review.id, version.number) : undefined}
              canSelectRange={isOpen}
              wholeActive={isOpen && whole}
              onSeek={seek}
              onScrubStart={() => ctrl?.pause()}
              onRange={(start, end) => {
                setAnchor({ kind: "range", time: start, endTime: end });
                setWhole(false);
                setSelectedId(null);
                focusBox();
              }}
              onClearRange={() => setAnchor((a) => (a.kind === "range" ? { kind: "time" } : a))}
              onSelect={selectById}
            />
          </div>
          <ReviewBottom r={r} comments={comments} dock={dock} onLatest={() => pickVersion(latest.number)} />
        </div>
        {(!side.open || side.overlay) && <CommentsRail side={side} count={comments.length} open={isOpen} />}
        <ReviewSidebar r={r} side={side} comments={comments} selectedId={selectedId} emptyState={emptyState} onSelect={(c) => selectComment(c)} />
      </div>
    </>
  );
}

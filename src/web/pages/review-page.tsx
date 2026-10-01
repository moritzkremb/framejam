import { ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, Keyboard, MessageSquarePlus, MousePointerClick, MoveHorizontal, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { BackHeader } from "@/components/header";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/menu";
import { CommentList } from "@/components/review/comment-list";
import { FeedbackDock, Handoff, type Anchor } from "@/components/review/dock";
import { Filmstrip, type Marker } from "@/components/review/filmstrip";
import { Player, type MediaController, type Pin } from "@/components/review/player";
import { isOffline, NotHere, Offline } from "@/components/states";
import { api, compositionUrl, copyText, formatTime, relativeTime, videoUrl, type Review, type ReviewComment } from "@/lib/api";
import { cn } from "@/lib/utils";

const FPS = 30;
const SHORTCUTS = "Space play/pause · ←/→ frame · Shift+←/→ 1s · C comment · Esc clear";

/** Width of whichever element the returned ref is attached to (the page swaps roots while loading). */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl, width };
}

function readCollapsed() {
  try {
    return localStorage.getItem("framejam:sidebar") === "collapsed";
  } catch {
    return false;
  }
}

function aspectLabel(w: number, h: number) {
  const r = w / h;
  if (Math.abs(r - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(r - 9 / 16) < 0.05) return "9:16";
  if (Math.abs(r - 1) < 0.05) return "1:1";
  if (Math.abs(r - 4 / 5) < 0.05) return "4:5";
  return `${w}×${h}`;
}

export function ReviewPage() {
  const { id = "" } = useParams();
  const [review, setReview] = useState<Review | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [ctrl, setCtrl] = useState<MediaController | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ kind: "time" });
  const [whole, setWhole] = useState(false);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const resumeTime = useRef(0);
  const knownLatest = useRef(0);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const { ref: rootRef, width } = useWidth<HTMLDivElement>();

  const load = useCallback(async () => {
    try {
      const r = await api.review(id);
      setReview(r);
      setLoadError(null);
      const latest = r.versions.at(-1)!;
      if (knownLatest.current && latest.number > knownLatest.current) {
        const prev = knownLatest.current;
        toast.success(`Version ${latest.number} is ready`, { description: latest.note ? `“${latest.note}”` : "Your agent shipped a new version." });
        // Follow the round: if you were on the latest version, move to the new one.
        setActiveVersion((v) => (v === null || v === prev ? latest.number : v));
        resumeTime.current = 0;
      }
      knownLatest.current = latest.number;
      setActiveVersion((v) => v ?? latest.number);
    } catch (e) {
      setLoadError(e);
    }
  }, [id]);

  useEffect(() => {
    knownLatest.current = 0;
    setReview(null);
    setActiveVersion(null);
    void load();
    const es = new EventSource(`/api/reviews/${id}/events`);
    es.addEventListener("changed", () => void load());
    return () => es.close();
  }, [id, load]);

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

  const handleController = useCallback((c: MediaController | null) => {
    setCtrl((prev) => {
      if (prev) resumeTime.current = prev.getTime();
      return c;
    });
    if (c && resumeTime.current) c.seek(Math.min(resumeTime.current, c.duration));
  }, []);

  const version = review?.versions.find((v) => v.number === activeVersion) ?? review?.versions.at(-1);
  const latest = review?.versions.at(-1);
  const isLatest = Boolean(version && latest && version.number === latest.number);
  const isOpen = isLatest && !version?.sentAt;

  // Comments belong to the version they were written on.
  const comments = useMemo(
    () =>
      (review?.comments ?? [])
        .filter((c) => c.version === version?.number)
        .sort((a, b) => a.time - b.time || a.createdAt.localeCompare(b.createdAt)),
    [review, version],
  );
  const indexOf = useMemo(() => new Map(comments.map((c, i) => [c.id, i + 1])), [comments]);

  // Latest version plays live (so clicks hit exact elements); older versions play their render as it was.
  const source: "video" | "live" | null = !version
    ? null
    : isLatest
      ? version.compositionDir
        ? "live"
        : "video"
      : version.videoPath
        ? "video"
        : "live";

  const duration = ctrl?.duration || 0;
  const aspect = ctrl ? ctrl.width / ctrl.height : 16 / 9;
  const vertical = aspect < 0.95;
  const mode: "stack" | "side" | "wide" = vertical ? (width >= 480 ? "side" : "stack") : width >= 1000 ? "wide" : "stack";

  const pins: Pin[] = comments
    .filter((c) => c.x !== undefined && c.y !== undefined && !c.wholeVideo)
    .filter((c) =>
      c.endTime !== undefined ? time >= c.time - 0.05 && time <= c.endTime + 0.05 : Math.abs(time - c.time) < 0.75 || c.id === selectedId,
    )
    .map((c) => ({ id: c.id, index: indexOf.get(c.id)!, x: c.x!, y: c.y!, sent: c.status !== "draft" }));

  const markers: Marker[] = comments
    .filter((c) => !c.wholeVideo)
    .map((c) => ({ id: c.id, index: indexOf.get(c.id)!, time: c.time, endTime: c.endTime, sent: c.status !== "draft" }));

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

  const selectComment = (c: ReviewComment) => {
    setSelectedId(c.id);
    if (!c.wholeVideo) {
      ctrl?.pause();
      seek(c.time);
    }
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
    focusBox();
  };

  const addComment = async () => {
    if (!review || !version || !text.trim() || adding) return;
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
        source: source ?? undefined,
        element: !whole && anchor.kind === "spot" ? anchor.element : undefined,
        thumbnailDataUrl: anchor.kind === "spot" ? anchor.thumbnailDataUrl : ctrl?.kind === "video" ? ctrl.captureFrame?.() : undefined,
      });
      setText("");
      setAnchor({ kind: "time" });
      setWhole(false);
      setSelectedId(c.id);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const send = async () => {
    if (!review || sending) return;
    if (text.trim()) await addComment();
    setSending(true);
    try {
      const res = await api.submit(review.id);
      if (res.agentWaiting) toast.success("Sent to your agent", { description: `${res.batch.commentIds.length} comments delivered instantly.` });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
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
      } else if (e.key === "Escape") {
        setAnchor({ kind: "time" });
        setSelectedId(null);
      } else if (e.key === "?") {
        toast(SHORTCUTS);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loadError && !review) {
    return (
      <div className="fc-rshell" ref={rootRef}>
        <BackHeader to="/" title="Review" />
        <main className="fc-main">
          {isOffline(loadError) ? (
            <Offline />
          ) : (
            <NotHere title="This review isn't here" message="It may have been deleted, or the link is from another computer." />
          )}
        </main>
      </div>
    );
  }

  if (!review || !version || !latest || !source) {
    return (
      <div className="fc-rshell" ref={rootRef}>
        <BackHeader to="/" title="Loading review" />
        <main className="fc-main">
          <div className="fc-skel" style={{ aspectRatio: "16 / 9", borderRadius: 14 }} />
          <div className="fc-skel" style={{ height: 56 }} />
          <div className="fc-skel" style={{ height: 120, width: "70%" }} />
        </main>
      </div>
    );
  }

  const src = source === "video" ? videoUrl(review.id, version.number) : compositionUrl(review.id, version.number);
  const batch = version.batchId ? review.batches.find((b) => b.id === version.batchId) : undefined;
  const draftCount = comments.filter((c) => c.status === "draft").length;
  const subline = [
    review.versions.length > 1 ? `Version ${version.number} of ${review.versions.length}` : `Version ${version.number}`,
    duration ? formatTime(duration, false) : null,
    ctrl ? aspectLabel(ctrl.width, ctrl.height) : null,
    version.sentAt ? "sent" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const setSidebar = (c: boolean) => {
    setCollapsed(c);
    try {
      localStorage.setItem("framejam:sidebar", c ? "collapsed" : "open");
    } catch {
      /* private mode */
    }
  };

  const header = (
    <BackHeader to="/" title={review.title} sub={subline}>
      <Menu
        label="Versions and more"
        trigger={
          <button type="button" className="fc-btn sm" aria-label="Versions and more">
            v{version.number} <ChevronDown className="fc-i xs" />
          </button>
        }
      >
        <MenuLabel>Version</MenuLabel>
        {[...review.versions].reverse().map((v) => (
          <MenuItem
            key={v.number}
            checked={v.number === version.number}
            hint={v.number === latest.number ? "latest" : relativeTime(v.createdAt)}
            onSelect={() => {
              resumeTime.current = 0;
              setSelectedId(null);
              setAnchor({ kind: "time" });
              setActiveVersion(v.number);
            }}
          >
            v{v.number}
            {v.note ? ` · ${v.note}` : ""}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          icon={<Copy className="fc-i sm" />}
          onSelect={async () => {
            try {
              await copyText(await api.prompt(review.id, version.number));
              toast.success("Comments copied as text", { description: "Paste them into any agent chat." });
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Copy comments as text
        </MenuItem>
        <MenuItem icon={<Keyboard className="fc-i sm" />} hint="?" onSelect={() => toast(SHORTCUTS)}>
          Keyboard shortcuts
        </MenuItem>
      </Menu>
    </BackHeader>
  );

  const player = (
    <Player
      src={src}
      source={source}
      pins={pins}
      newPin={isOpen && !whole && anchor.kind === "spot" ? anchor : null}
      selectedId={selectedId}
      showHint={isOpen && comments.length === 0 && anchor.kind === "time"}
      interactive={isOpen}
      className={cn(mode === "side" && "tall")}
      style={
        mode === "side"
          ? { height: "100%", aspectRatio: `${aspect}` }
          : mode === "wide"
            ? { aspectRatio: `${aspect}`, width: "100%", maxHeight: collapsed ? "calc(100dvh - 330px)" : "calc(100dvh - 210px)" }
            : { aspectRatio: `${aspect}`, width: "100%", maxHeight: vertical ? "40dvh" : "48dvh" }
      }
      onController={handleController}
      onFrameClick={onFrameClick}
      onPinClick={(cid) => {
        const c = review.comments.find((x) => x.id === cid);
        if (c) selectComment(c);
      }}
    />
  );

  const controls = (
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
  );

  const filmstrip = (
    <Filmstrip
      duration={duration}
      time={time}
      markers={markers}
      range={isOpen && !whole && anchor.kind === "range" ? { start: anchor.time, end: anchor.endTime } : null}
      selectedId={selectedId}
      frameSource={version.videoPath ? videoUrl(review.id, version.number) : undefined}
      canSelectRange={isOpen}
      onSeek={seek}
      onScrubStart={() => ctrl?.pause()}
      onRange={(start, end) => {
        seek(start);
        setAnchor({ kind: "range", time: start, endTime: end });
        setWhole(false);
        setSelectedId(null);
        focusBox();
      }}
      onSelect={(cid) => {
        const c = review.comments.find((x) => x.id === cid);
        if (c) selectComment(c);
      }}
    />
  );

  const emptyState = isOpen ? (
    <div className="fc-empty fc-empty-left">
      <div className="fc-h3">{version.number > 1 ? `Version ${version.number} is here. What should change?` : "What should change?"}</div>
      <p>
        {version.number > 1 && version.note ? `“${version.note}” ` : ""}
        Pause anywhere and type below, or point at exactly what you mean:
      </p>
      <div className="fc-ways">
        <div>
          <MousePointerClick className="fc-i sm" /> Click the video to mark a spot
        </div>
        <div>
          <MoveHorizontal className="fc-i sm" /> Drag across the filmstrip to pick a range
        </div>
        <div>
          <MessageSquarePlus className="fc-i sm" /> Comment at the current time <span className="fc-kbd">C</span>
        </div>
      </div>
    </div>
  ) : (
    <p className="fc-caption" style={{ padding: 12 }}>
      No comments on this version.
    </p>
  );

  const panel = (
    <div className="fc-panel">
      <div className="fc-panel-h">
        <span className="fc-h3">Comments</span>
        {mode === "wide" && (
          <button type="button" className="fc-btn ghost icon sm round" aria-label="Collapse comments" onClick={() => setSidebar(true)}>
            <ChevronRight className="fc-i sm" />
          </button>
        )}
      </div>
      <div className="fc-panel-body">
        {!isLatest && (
          <div className="fc-oldbar">
            <Clock className="fc-i sm" />
            <span className="fc-grow">
              You're looking at <b>version {version.number}</b>.{" "}
              {version.sentAt ? `Its comments were sent and made version ${version.number + 1}.` : "It was never sent."}
            </span>
            <button
              type="button"
              className="fc-btn primary sm"
              onClick={() => {
                resumeTime.current = 0;
                setSelectedId(null);
                setActiveVersion(latest.number);
              }}
            >
              Go to latest
            </button>
          </div>
        )}
        {comments.length ? (
          <CommentList
            comments={comments}
            editable={isOpen}
            selectedId={selectedId}
            onSelect={selectComment}
            onSave={async (c, t) => {
              try {
                await api.updateComment(review.id, c.id, { text: t });
                await load();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
            onDelete={async (c) => {
              try {
                await api.deleteComment(review.id, c.id);
                if (selectedId === c.id) setSelectedId(null);
                await load();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          />
        ) : (
          emptyState
        )}
      </div>
    </div>
  );

  const bottom = !isLatest ? null : isOpen ? (
    <FeedbackDock
      ref={boxRef}
      anchor={anchor}
      whole={whole}
      time={time}
      text={text}
      draftCount={draftCount}
      agentWaiting={Boolean(review.agentWaitingAt)}
      sending={sending}
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
      onSend={() => void send()}
    />
  ) : (
    <Handoff reviewId={review.id} delivered={Boolean(batch?.deliveredAt)} nextVersion={version.number + 1} />
  );

  if (mode === "wide") {
    return (
      <div className="fc-rshell" ref={rootRef}>
        {header}
        <div className={cn("fc-rbody wide", collapsed && "collapsed")}>
          <div className="stage">
            <div className="fc-stage-inner">
              {player}
              <div>
                {controls}
                {filmstrip}
              </div>
              {collapsed && bottom && <div className="fc-stage-dock">{bottom}</div>}
            </div>
          </div>
          <div className="side">
            {collapsed ? (
              <div className="fc-rail">
                <button type="button" className="fc-railbtn" aria-label="Show comments" onClick={() => setSidebar(false)}>
                  <ChevronLeft className="fc-i sm" />
                </button>
                <button type="button" className="fc-railbtn" aria-label={`${comments.length} comments`} onClick={() => setSidebar(false)}>
                  <MessageSquarePlus className="fc-i sm" />
                  {comments.length > 0 && <span className={cn("c", isOpen ? "draft" : "sent")}>{comments.length}</span>}
                </button>
              </div>
            ) : (
              <>
                <div className="fc-side-panel">{panel}</div>
                {bottom}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fc-rshell" ref={rootRef}>
      {header}
      {mode === "side" ? (
        <div className="fc-rbody side">
          <div className="fc-vcol">{player}</div>
          {panel}
          <div className="fc-transport-wide">
            {controls}
            {filmstrip}
          </div>
        </div>
      ) : (
        <div className="fc-rbody stack">
          <div className="fc-col" style={{ gap: 4 }}>
            {player}
            {controls}
            {filmstrip}
          </div>
          {panel}
        </div>
      )}
      {bottom}
    </div>
  );
}

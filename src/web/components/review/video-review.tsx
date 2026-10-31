import { ChevronLeft, ChevronRight, Eraser, Maximize, MessageSquarePlus, Minimize, MousePointerClick, MoveHorizontal, Pause, PenLine, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { toast } from "sonner";
import { FeedbackDock, type Anchor } from "@/components/review/dock";
import { burnFrame, DrawLayer, MAX_STROKES, type Stroke } from "@/components/review/drawing";
import { Filmstrip, useTimelineZoom, ZoomControls, type Marker } from "@/components/review/filmstrip";
import { draftVoice, frameOf, type GuestKit, type MakeComment } from "@/components/review/guest";
import { byTime, numberComments, type ReviewRole } from "@/components/review/numbering";
import { Player, type FloatingNote, type MediaController, type Pin } from "@/components/review/player";
import {
  CommentsRail,
  DownloadButton,
  railed,
  ReviewBottom,
  ReviewHeader,
  ReviewSidebar,
  showComments,
  useSidebar,
  type Shortcut,
  type SidebarTab,
} from "@/components/review/review-shell";
import { TranscriptionState, TranscriptPanel, useTranscript, useTranscription } from "@/components/review/transcript";
import type { ReviewState } from "@/components/review/use-review";
import { hasHandoff, VersionNotes } from "@/components/review/version-notes";
import { canRecordVoice, useVoiceRecorder, VoiceButton, type VoiceLook } from "@/components/review/voice";
import { formatTime, type ReviewComment } from "@/lib/api";
import { cn, FINISH_KEYS, MOD_KEY, SHIFT_KEY } from "@/lib/utils";
import { GUEST_VIDEO_ERROR } from "@/lib/video-cors";
import { sampleAt } from "../../../core/voice";

const FPS = 30;
const RATES = [1, 1.5, 2, 0.5];
const shortcuts = (guest: boolean): Shortcut[] => [
  ["Play or pause", ["Space"]],
  ["Change playback speed", ["S"]],
  ["Full screen", ["F"]],
  ["Show or hide comments", [MOD_KEY, "B"]],
  ["Previous or next frame", ["←", "→"]],
  ["Jump 1 second", [SHIFT_KEY, "←", "→"]],
  ["Comment at this moment", ["C"]],
  ["Comment on the whole video", ["W"]],
  ["Add comment", ["↩"]],
  ["New line in a comment", [SHIFT_KEY, "↩"]],
  [guest ? "Send your comments" : "Finish review", [FINISH_KEYS]],
  ["Zoom the timeline (or pinch)", [MOD_KEY, "Scroll"]],
  ["Clear the selection", ["Esc"]],
  ["Show shortcuts", ["?"]],
];
/** How long a comment without a range stays on screen after its timestamp. */
const POINT_VISIBLE_FOR = 1.5;
/** How close (seconds) the video must be to a pinned frame for its pin and drawing to belong to what is on screen. */
const ON_FRAME = 0.06;

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

const drawingOf = (c: ReviewComment) => (c as ReviewComment & { drawing?: Stroke[] }).drawing ?? [];

/**
 * The video review, the same screen for the local app, the creator's cloud page and a guest on the share link. Only
 * the role's own controls differ: the creator finishes the round and hands it to the agent; a guest draws, records
 * voice, sends and approves through `guest`.
 */
export function VideoReview({
  r,
  width,
  resumeTime,
  onCompare,
  role = "local",
  guest,
}: {
  r: ReviewState;
  width: number;
  resumeTime: MutableRefObject<number>;
  onCompare?: () => void;
  role?: ReviewRole;
  guest?: GuestKit;
}) {
  const review = r.review!;
  const version = r.version!;
  const latest = r.latest!;
  const { data, isOpen, load } = r;
  const [ctrl, setCtrl] = useState<MediaController | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const rateRef = useRef(1);
  const [anchor, setAnchor] = useState<Anchor>({ kind: "time" });
  const [whole, setWhole] = useState(false);
  const [text, setText] = useState("");
  const [ownAdding, setOwnAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [drawOn, setDrawOn] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const watchRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const side = useSidebar(width, fullscreen);
  const [sideTab, setSideTab] = useState<SidebarTab>("comments");
  const transcript = useTranscript(data, review.id, version);
  const transcription = useTranscription(data, review.id, version);
  const adding = guest ? guest.adding : ownAdding;

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement) && document.fullscreenElement === watchRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

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
      c?.setRate(rateRef.current);
    },
    [resumeTime],
  );

  // Comments belong to the version they were written on.
  const { ordered: comments, number: indexOf } = useMemo(
    () =>
      numberComments(
        review.comments.filter((c) => c.version === version.number),
        role,
        byTime,
      ),
    [review, version, role],
  );

  const duration = ctrl?.duration || 0;
  const zoom = useTimelineZoom(duration);

  const here = comments.filter((c) => isAt(c, time));
  const pins: Pin[] = here
    .filter((c) => c.x !== undefined && c.y !== undefined)
    .map((c) => ({ id: c.id, index: indexOf.get(c.id)!, x: c.x!, y: c.y!, sent: c.status !== "draft", text: c.text, author: c.author }));
  const floating: FloatingNote[] = here
    .filter((c) => c.x === undefined || c.y === undefined)
    .map((c) => ({ id: c.id, index: indexOf.get(c.id)!, sent: c.status !== "draft", text: c.text, author: c.author }));
  const shownStrokes = here.flatMap(drawingOf);
  const markers: Marker[] = comments.map((c) => ({ id: c.id, index: indexOf.get(c.id)!, time: c.time, endTime: c.endTime, whole: c.wholeVideo, sent: c.status !== "draft" }));

  const exitFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) exitFullscreen();
    else {
      side.openForFullscreen();
      void watchRef.current?.requestFullscreen().catch(() => {});
    }
  };

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

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    rateRef.current = next;
    setRate(next);
    ctrl?.setRate(next);
  };

  const reset = () => {
    setAnchor({ kind: "time" });
    setWhole(false);
    setDrawOn(false);
    setStrokes([]);
  };

  /** Pauses and pins the comment to the frame on screen (or a spot on it), unless it's already attached to something. */
  const stamp = (spot?: { x: number; y: number }) => {
    if (!ctrl) return;
    ctrl.pause();
    const t = ctrl.getTime();
    // A pin or drawing belongs to the frame it was made on: after scrubbing elsewhere, a new one starts fresh.
    const moved = (anchor.kind === "frame" || anchor.kind === "spot") && Math.abs(anchor.time - t) > ON_FRAME;
    if (moved) setStrokes([]);
    setAnchor((a) => {
      if (spot) return { kind: "spot", time: t, ...spot, frame: ctrl.captureFrame() };
      if (a.kind !== "time" && !moved) return a;
      return { kind: "frame", time: t, frame: ctrl.captureFrame() };
    });
    setWhole(false);
    setSelectedId(null);
  };

  const selectComment = (c: ReviewComment, opts: { openSidebar?: boolean } = {}) => {
    setSelectedId(c.id);
    if (opts.openSidebar) {
      showComments(side);
      setSideTab("comments");
    }
    if (!c.wholeVideo) {
      ctrl?.pause();
      seek(c.time);
    }
  };
  const commentOnRange = (start: number, end: number) => {
    ctrl?.pause();
    setAnchor({ kind: "range", time: start, endTime: end });
    setWhole(false);
    setDrawOn(false);
    setStrokes([]);
    setSelectedId(null);
    focusBox();
  };

  const selectById = (cid: string) => {
    const c = review.comments.find((x) => x.id === cid);
    if (c) selectComment(c, { openSidebar: !side.stacked });
  };

  const onFrameClick = (x: number, y: number) => {
    if (!ctrl || !isOpen) return;
    stamp({ x, y });
    if (side.overlay) side.setOpen(false);
    focusBox();
  };

  const onText = (t: string) => {
    setText(t);
    if (t.trim() && !whole && anchor.kind === "time") stamp();
  };

  /** The comment being typed, with its pin and drawing burned into the frame. */
  const makeComment: MakeComment = async () => {
    const pinned = !whole && (anchor.kind === "frame" || anchor.kind === "spot") ? anchor : undefined;
    const spot = pinned?.kind === "spot" ? { x: pinned.x, y: pinned.y } : undefined;
    const drawn = pinned ? strokes : [];
    return {
      version: version.number,
      time: anchor.kind === "time" ? (ctrl?.getTime() ?? time) : anchor.time,
      endTime: !whole && anchor.kind === "range" ? anchor.endTime : undefined,
      x: spot?.x,
      y: spot?.y,
      wholeVideo: whole || undefined,
      text,
      ...(drawn.length ? { drawing: drawn } : {}),
      thumbnailDataUrl: await burnFrame(pinned?.frame ?? ctrl?.captureFrame(), { pin: spot, strokes: drawn }),
    };
  };

  const afterAdd = (c: ReviewComment) => {
    setText("");
    reset();
    setSelectedId(c.id);
  };

  const ownerAdd = async () => {
    if (!text.trim() || ownAdding) return;
    setOwnAdding(true);
    try {
      const body = await makeComment();
      if (!body) return;
      const c = await data.addComment(review.id, body);
      afterAdd(c);
      // Hand the keyboard back to the player so Space resumes playback.
      (document.activeElement as HTMLElement | null)?.blur();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOwnAdding(false);
    }
  };

  const addComment = () => {
    if (!text.trim() || adding) return;
    if (guest) guest.add(makeComment, afterAdd);
    else void ownerAdd();
  };

  const finish = async () => {
    if (guest) return guest.send(text.trim() ? { make: makeComment, after: afterAdd } : undefined);
    if (text.trim()) await ownerAdd();
    await r.finish();
  };

  const recorder = useVoiceRecorder({
    look: (): VoiceLook | null => {
      if (!ctrl) return null;
      const t = ctrl.getTime();
      const on = !whole && (anchor.kind === "frame" || anchor.kind === "spot") && Math.abs(anchor.time - t) < ON_FRAME ? anchor : undefined;
      return {
        time: t,
        x: on?.kind === "spot" ? on.x : undefined,
        y: on?.kind === "spot" ? on.y : undefined,
        strokes: on ? strokes : [],
        playing: ctrl.isPlaying(),
        frame: () => on?.frame ?? ctrl.captureFrame(),
      };
    },
    onTake: async (take) => {
      if (!guest) return;
      const range = !whole && anchor.kind === "range" ? anchor : undefined;
      const wholeVideo = whole || undefined;
      const now = ctrl?.getTime() ?? 0;
      const first = take.samples[0];
      await guest.addTake(
        take,
        async (heard) => {
          const sampled = (heard?.phrases ?? []).map((p) => ({ p, sample: sampleAt(take.samples, p.at) ?? first }));
          const points = await Promise.all(
            sampled.map(async ({ p, sample }) => ({
              phrase: p.phrase,
              at: p.at,
              time: sample?.time ?? now,
              x: sample?.x,
              y: sample?.y,
              drawing: sample?.strokes.length ? sample.strokes : undefined,
              frame: await frameOf(sample),
            })),
          );
          const main = sampled[0]?.sample ?? first;
          return {
            version: version.number,
            time: range?.time ?? main?.time ?? now,
            endTime: range?.endTime,
            x: range ? undefined : main?.x,
            y: range ? undefined : main?.y,
            wholeVideo,
            text: heard ? heard.text || heard.result.note || "" : "",
            drawing: !range && main?.strokes.length ? main.strokes : undefined,
            thumbnailDataUrl: await frameOf(main),
            voice: heard ? draftVoice(heard.result, points) : undefined,
          };
        },
        reset,
      );
    },
    onError: (message) => toast.error(message),
  });

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true], [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        cycleRate();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
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
        setDrawOn(false);
        focusBox();
      } else if (e.key === "Escape") {
        reset();
        setSelectedId(null);
        if (side.overlay) side.setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const src = data.videoUrl(review.id, version.number);
  const draftCount = guest ? guest.draftCount : comments.filter((c) => c.status === "draft").length;
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
    reset();
    r.setActiveVersion(n);
  };

  const pinnedHere = (anchor.kind === "frame" || anchor.kind === "spot") && Math.abs(anchor.time - time) <= ON_FRAME * 2;
  const tools = guest && (
    <>
      {canRecordVoice() && <VoiceButton phase={recorder.phase} seconds={recorder.seconds} disabled={guest.busy || adding} onStart={() => guest.startVoice(() => void recorder.start())} onStop={recorder.stop} />}
      {!whole && strokes.length > 0 && (
        <button type="button" className="fc-btn ghost sm icon" aria-label="Clear drawing" title="Clear drawing" onClick={() => setStrokes([])}>
          <Eraser className="fc-i xs" />
        </button>
      )}
      {!whole && (
        <button
          type="button"
          className={cn("fc-btn ghost sm fc-chip-btn", drawOn && "on")}
          aria-pressed={drawOn}
          onClick={() => {
            if (!drawOn) stamp();
            setDrawOn(!drawOn);
          }}
          title="Draw on the frame"
          data-testid="draw-toggle"
        >
          <PenLine className="fc-i xs" /> Draw
        </button>
      )}
    </>
  );

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
      finishing={guest ? guest.busy : r.finishing}
      adding={adding}
      onText={onText}
      onClearAnchor={() => {
        reset();
        focusBox();
      }}
      onWhole={(on) => {
        setWhole(on);
        if (on) {
          setDrawOn(false);
          setStrokes([]);
        }
        focusBox();
      }}
      onAdd={addComment}
      onFinish={() => void finish()}
      tools={tools}
      status={guest?.status}
      primary={guest?.primary}
      beforeFinish={!guest && version.videoPath ? <DownloadButton data={data} review={review} version={version} /> : undefined}
    />
  );

  const bottom = <ReviewBottom r={r} role={role} comments={comments} dock={dock} onLatest={() => pickVersion(latest.number)} />;
  const bottomInSide = fullscreen && side.open && !side.overlay;

  const emptyState = (
    <div className="fc-side-empty">
      <div className="fc-h3">No comments yet</div>
      <p>Pause anywhere and type in the box {bottomInSide ? "below" : "under the timeline"}, or point at exactly what you mean:</p>
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
      {guest && <p>Your comments stay in this browser until you press Send.</p>}
    </div>
  );

  return (
    <>
      <ReviewHeader r={r} role={role} subline={subline} shortcuts={shortcuts(Boolean(guest))} onPickVersion={pickVersion} onCompare={onCompare} actions={guest?.actions} />
      <div ref={watchRef} className={cn("fc-review", railed(side) && "railed", side.stacked && "stacked")}>
        <div className="fc-stage" style={{ "--content-w": `${Math.max(frameWidth, 520)}px` } as CSSProperties}>
          <Player
            src={src}
            pins={pins}
            floating={floating}
            newPin={isOpen && !whole && anchor.kind === "spot" && pinnedHere ? anchor : null}
            selectedId={selectedId}
            showHint={isOpen && comments.length === 0 && anchor.kind === "time" && !playing && !drawOn}
            interactive={isOpen && !drawOn}
            style={{ flex: "0 1 auto", width: "100%", aspectRatio: `${ctrl ? ctrl.width / ctrl.height : 16 / 9}`, minHeight: 160 }}
            onController={handleController}
            onFrameClick={onFrameClick}
            onPinClick={selectById}
            onFrameWidth={setFrameWidth}
            onMoreNotes={() => {
              setSideTab("comments");
              showComments(side);
            }}
            errorMessage={guest ? (src ? GUEST_VIDEO_ERROR : "This video isn't available yet.") : undefined}
            blockedText={guest ? GUEST_VIDEO_ERROR : undefined}
          >
            <DrawLayer
              strokes={!whole && pinnedHere ? strokes : []}
              shown={shownStrokes}
              active={drawOn}
              onStroke={(st) => setStrokes((all) => [...all, st].slice(0, MAX_STROKES))}
            />
          </Player>
          <div className="fc-transport">
            <div className="fc-controls">
              <button type="button" className="fc-play" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay} disabled={!ctrl}>
                {playing ? <Pause className="fc-i fill" /> : <Play className="fc-i fill" />}
              </button>
              <span className="fc-readout">
                {formatTime(time)} <span>/ {formatTime(duration)}</span>
              </span>
              <button
                type="button"
                className={cn("fc-btn ghost sm fc-rate", rate !== 1 && "on")}
                aria-label={`Playback speed ${rate}×`}
                title="Playback speed (S)"
                onClick={cycleRate}
                disabled={!ctrl}
              >
                {rate}×
              </button>
              <span className="fc-grow" />
              <ZoomControls zoom={zoom} time={time} />
              <button type="button" className="fc-btn ghost icon sm round" aria-label="Previous frame" onClick={() => step(-1)}>
                <ChevronLeft className="fc-i sm" />
              </button>
              <button type="button" className="fc-btn ghost icon sm round" aria-label="Next frame" onClick={() => step(1)}>
                <ChevronRight className="fc-i sm" />
              </button>
              <button
                type="button"
                className="fc-btn ghost icon sm round"
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                title={fullscreen ? "Exit full screen (F)" : "Full screen (F)"}
                onClick={toggleFullscreen}
                disabled={!ctrl}
              >
                {fullscreen ? <Minimize className="fc-i sm" /> : <Maximize className="fc-i sm" />}
              </button>
            </div>
            <Filmstrip
              duration={duration}
              time={time}
              zoom={zoom}
              markers={markers}
              range={isOpen && !whole && anchor.kind === "range" ? { start: anchor.time, end: anchor.endTime } : null}
              selectedId={selectedId}
              frameSource={version.videoPath ? src : undefined}
              words={transcript?.words}
              canSelectRange={isOpen}
              wholeActive={isOpen && whole}
              onSeek={seek}
              onScrubStart={() => ctrl?.pause()}
              onRange={commentOnRange}
              onClearRange={() => setAnchor((a) => (a.kind === "range" ? { kind: "time" } : a))}
              onSelect={selectById}
            />
          </div>
          {!bottomInSide && bottom}
        </div>
        {railed(side) && <CommentsRail side={side} count={comments.length} open={isOpen} />}
        <ReviewSidebar
          r={r}
          side={side}
          comments={comments}
          selectedId={selectedId}
          emptyState={emptyState}
          footer={bottomInSide ? bottom : undefined}
          rules={guest?.rules}
          before={guest?.before}
          transcript={
            transcript ? (
              <TranscriptPanel
                transcript={transcript}
                time={time}
                playing={playing}
                canComment={isOpen}
                range={isOpen && !whole && anchor.kind === "range" ? { start: anchor.time, end: anchor.endTime } : null}
                onSeek={(t) => {
                  seek(t);
                  zoom.focus(t);
                  setAnchor((a) => (a.kind === "range" ? { kind: "time" } : a));
                }}
                onRange={(start, end) => {
                  seek(start);
                  zoom.focus(start, end);
                  commentOnRange(start, end);
                }}
              />
            ) : (
              transcription ? <TranscriptionState transcription={transcription} /> : version?.transcript && <div className="fc-transcript" />
            )
          }
          notes={hasHandoff(version) ? <VersionNotes data={guest ? undefined : data} reviewId={review.id} version={version} /> : undefined}
          tab={sideTab}
          onTab={setSideTab}
          onSelect={(c) => selectComment(c)}
          onPoint={(c, i) => {
            setSelectedId(c.id);
            ctrl?.pause();
            const t = c.voice?.points[i]?.time;
            if (t !== undefined) seek(t);
          }}
        />
      </div>
    </>
  );
}

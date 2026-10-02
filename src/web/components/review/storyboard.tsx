import { ChevronLeft, ChevronRight, LayoutGrid, MapPin, MessageSquarePlus, MousePointerClick, Plus, Square, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { toast } from "sonner";
import { FeedbackDock } from "@/components/review/dock";
import { CommentsRail, ReviewBottom, ReviewHeader, ReviewSidebar, useSidebar } from "@/components/review/review-shell";
import type { ReviewState } from "@/components/review/use-review";
import { api, panelUrl, type ReviewComment, type StoryboardPanel } from "@/lib/api";
import { cn, FINISH_KEYS } from "@/lib/utils";

const SHORTCUTS = `←/→ previous/next panel · B board · C comment · ${FINISH_KEYS} finish review · Esc clear`;

type View = "board" | "panel";

/** Panel image with the pin drawn on it, so the agent sees exactly where you pointed. */
function panelThumbnail(img: HTMLImageElement | null, spot: { x: number; y: number } | null): string | undefined {
  if (!img?.naturalWidth) return undefined;
  try {
    const scale = Math.min(1, 640 / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const g = canvas.getContext("2d")!;
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (spot) {
      const r = Math.max(9, canvas.width / 45);
      g.beginPath();
      g.arc(spot.x * canvas.width, spot.y * canvas.height, r, 0, Math.PI * 2);
      g.fillStyle = "#d4ff3a";
      g.fill();
      g.lineWidth = Math.max(2, r / 4);
      g.strokeStyle = "#111";
      g.stroke();
    }
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return undefined;
  }
}

/** Largest box of the image's aspect that fits the element (which only exists in panel view). */
function useFitBox(aspect: number) {
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.min(width, height * aspect);
      setBox({ width: Math.floor(w), height: Math.floor(w / aspect) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, aspect]);
  return { ref, box };
}

function PanelPins({
  comments,
  indexOf,
  selectedId,
  onPinClick,
}: {
  comments: ReviewComment[];
  indexOf: Map<string, number>;
  selectedId: string | null;
  onPinClick?(id: string): void;
}) {
  return (
    <>
      {comments
        .filter((c) => c.x !== undefined && c.y !== undefined)
        .map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.text}
            aria-label={`Comment ${indexOf.get(c.id)}: ${c.text}`}
            className={cn("fc-pin", c.status === "draft" ? "draft" : "sent", selectedId === c.id && "is-selected")}
            style={{ left: `${c.x! * 100}%`, top: `${c.y! * 100}%` }}
            onClick={(e) => {
              e.stopPropagation();
              onPinClick?.(c.id);
            }}
          >
            {indexOf.get(c.id)}
          </button>
        ))}
    </>
  );
}

export function StoryboardReview({ r, width }: { r: ReviewState; width: number }) {
  const review = r.review!;
  const version = r.version!;
  const latest = r.latest!;
  const { isOpen, load } = r;
  const panels: StoryboardPanel[] = version.panels ?? [];
  const [view, setView] = useState<View>("board");
  const [current, setCurrent] = useState(1);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [native, setNative] = useState({ width: 16, height: 9 });
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const side = useSidebar(width);
  const { ref: fitRef, box } = useFitBox(native.width / native.height);

  const panel = Math.min(Math.max(1, current), panels.length);
  const whole = view === "board";

  useEffect(() => {
    if (current > panels.length) setCurrent(1);
  }, [current, panels.length]);

  const comments = useMemo(
    () =>
      review.comments
        .filter((c) => c.version === version.number)
        .sort(
          (a, b) =>
            Number(!!b.wholeVideo) - Number(!!a.wholeVideo) || (a.panel ?? 0) - (b.panel ?? 0) || a.createdAt.localeCompare(b.createdAt),
        ),
    [review, version],
  );
  const indexOf = useMemo(() => new Map(comments.map((c, i) => [c.id, i + 1])), [comments]);
  const onPanel = (n: number) => comments.filter((c) => c.panel === n);
  const here = onPanel(panel);
  const draftCount = comments.filter((c) => c.status === "draft").length;

  const panelName = (n: number) => `Panel ${n}${panels[n - 1]?.title ? ` · ${panels[n - 1].title}` : ""}`;
  const label = (c: ReviewComment) => (c.wholeVideo ? "Whole storyboard" : c.panel ? panelName(c.panel) : "");

  const focusBox = () => requestAnimationFrame(() => boxRef.current?.focus());

  const openPanel = (n: number) => {
    setCurrent(n);
    setView("panel");
    setSpot(null);
  };

  const go = (delta: number) => {
    if (!panels.length) return;
    setCurrent(((panel - 1 + delta + panels.length) % panels.length) + 1);
    setSpot(null);
    setView("panel");
  };

  const selectComment = (c: ReviewComment, opts: { openSidebar?: boolean } = {}) => {
    setSelectedId(c.id);
    if (opts.openSidebar) side.setOpen(true);
    if (c.panel) {
      setCurrent(c.panel);
      setView("panel");
      setSpot(null);
    }
  };
  const selectById = (cid: string) => {
    const c = review.comments.find((x) => x.id === cid);
    if (c) selectComment(c, { openSidebar: true });
  };

  const onFrameClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!isOpen) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setSpot({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
    setSelectedId(null);
    if (side.overlay) side.setOpen(false);
    focusBox();
  };

  const addComment = async () => {
    if (!text.trim() || adding) return;
    setAdding(true);
    try {
      const c = await api.addComment(review.id, {
        version: version.number,
        time: 0,
        panel: whole ? undefined : panel,
        x: !whole && spot ? spot.x : undefined,
        y: !whole && spot ? spot.y : undefined,
        wholeVideo: whole || undefined,
        text,
        thumbnailDataUrl: whole ? undefined : panelThumbnail(imgRef.current, spot),
      });
      setText("");
      setSpot(null);
      setSelectedId(c.id);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "b" || e.key === "B") {
        setView((v) => (v === "board" ? "panel" : "board"));
        setSpot(null);
      } else if ((e.key === "c" || e.key === "C") && isOpen) {
        e.preventDefault();
        focusBox();
      } else if (e.key === "Escape") {
        setSpot(null);
        setSelectedId(null);
        if (side.overlay) side.setOpen(false);
      } else if (e.key === "?") {
        toast(SHORTCUTS);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pickVersion = (n: number) => {
    setSelectedId(null);
    setSpot(null);
    r.setActiveVersion(n);
  };

  const subline = [
    review.versions.length > 1 ? `Version ${version.number} of ${review.versions.length}` : `Version ${version.number}`,
    `Storyboard · ${panels.length} panel${panels.length === 1 ? "" : "s"}`,
    version.sentAt ? "review finished" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const chip = spot ? (
    <span className="fc-anchor">
      <MapPin className="fc-i xs" /> Panel {panel} · this spot
      <button type="button" className="x" aria-label="Remove spot" onClick={() => setSpot(null)}>
        <X className="fc-i xs" />
      </button>
    </span>
  ) : (
    <span className="fc-anchor plain">
      <Square className="fc-i xs" /> Panel {panel}
    </span>
  );

  const dock = (
    <FeedbackDock
      ref={boxRef}
      anchor={{ kind: "time" }}
      whole={whole}
      time={0}
      text={text}
      draftCount={draftCount}
      agentListening={Boolean(review.agentListening)}
      agentOutdated={Boolean(review.agentOutdated)}
      finishing={r.finishing}
      adding={adding}
      chip={chip}
      wholeLabel="Whole storyboard"
      placeholder={spot ? "What should change here?" : `What should change in panel ${panel}? Click the panel to point at a spot.`}
      onText={setText}
      onClearAnchor={() => setSpot(null)}
      onWhole={(on) => {
        if (on) setView("board");
        else openPanel(panel);
        setSpot(null);
        focusBox();
      }}
      onAdd={() => void addComment()}
      onFinish={() => void finish()}
    />
  );

  const emptyState = (
    <div className="fc-side-empty">
      <div className="fc-h3">No comments yet</div>
      <p>Type a note about the whole storyboard, or open a panel and point at exactly what you mean:</p>
      <div className="fc-ways">
        <div>
          <LayoutGrid className="fc-i sm" /> Click a panel on the board to open it
        </div>
        <div>
          <MousePointerClick className="fc-i sm" /> Click inside a panel to mark a spot
        </div>
        <div>
          <MessageSquarePlus className="fc-i sm" /> Or just type, for the whole panel <span className="fc-kbd">C</span>
        </div>
      </div>
    </div>
  );

  const toolbar = (
    <div className="fc-sbar">
      <div className="fc-seg sm" role="group" aria-label="View">
        <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>
          <LayoutGrid className="fc-i xs" /> Board
        </button>
        <button type="button" aria-pressed={view === "panel"} onClick={() => openPanel(panel)}>
          <Square className="fc-i xs" /> Panel
        </button>
      </div>
      <span className="fc-grow" />
      {view === "panel" ? (
        <>
          <span className="fc-readout">
            {panel} <span>/ {panels.length}</span>
          </span>
          <button type="button" className="fc-btn ghost icon sm round" aria-label="Previous panel" onClick={() => go(-1)}>
            <ChevronLeft className="fc-i sm" />
          </button>
          <button type="button" className="fc-btn ghost icon sm round" aria-label="Next panel" onClick={() => go(1)}>
            <ChevronRight className="fc-i sm" />
          </button>
        </>
      ) : (
        <span className="fc-caption">{isOpen ? "Click a panel to open it and comment on it" : `${panels.length} panels`}</span>
      )}
    </div>
  );

  const board = (
    <div className="fc-board-wrap">
      <ol className="fc-board">
        {panels.map((p, i) => {
          const n = i + 1;
          const list = onPanel(n);
          return (
            <li key={p.image || n}>
              <button type="button" className="fc-bcard" data-testid="storyboard-panel" onClick={() => openPanel(n)}>
                <span className="img">
                  <img src={panelUrl(review.id, version.number, n)} alt={p.title ?? `Panel ${n}`} loading="lazy" />
                  <span className="pins">
                    <PanelPins comments={list} indexOf={indexOf} selectedId={selectedId} onPinClick={selectById} />
                  </span>
                  <span className="n">{n}</span>
                  {list.length > 0 && <span className={cn("cc", isOpen ? "draft" : "sent")}>{list.length}</span>}
                </span>
                {(p.title || p.caption) && (
                  <span className="txt">
                    {p.title && <span className="t">{p.title}</span>}
                    {p.caption && <span className="c">{p.caption}</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );

  const shown = panels[panel - 1];
  const panelView = (
    <>
      <div className="fc-player" style={{ flex: "0 1 auto", width: "100%", aspectRatio: `${native.width / native.height}`, minHeight: 160 }}>
        <div ref={fitRef} className="fc-player-fit">
          <div className="frame" style={{ width: box.width || "100%", height: box.height || "100%" }}>
            <img
              key={`${version.number}-${panel}`}
              ref={imgRef}
              className="fc-media fc-panel-img"
              src={panelUrl(review.id, version.number, panel)}
              alt={shown?.title ?? `Panel ${panel}`}
              onLoad={(e) => setNative({ width: e.currentTarget.naturalWidth || 16, height: e.currentTarget.naturalHeight || 9 })}
            />
            <div data-testid="frame-overlay" className={cn("fc-overlay", isOpen && "interactive")} role="presentation" onClick={onFrameClick}>
              <PanelPins comments={here} indexOf={indexOf} selectedId={selectedId} onPinClick={selectById} />
              {spot && (
                <span className="fc-pin new" style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}>
                  <Plus className="fc-i" />
                </span>
              )}
              {here.some((c) => c.x === undefined) && (
                <div className="fc-floating">
                  {here
                    .filter((c) => c.x === undefined)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={cn("fc-note", c.status === "draft" ? "draft" : "sent", selectedId === c.id && "is-selected")}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectById(c.id);
                        }}
                      >
                        <span className="n">{indexOf.get(c.id)}</span>
                        <span className="fc-truncate">{c.text}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {(shown?.title || shown?.caption) && (
        <div className="fc-pcap">
          {shown.title && <div className="t">{shown.title}</div>}
          {shown.caption && <p>{shown.caption}</p>}
        </div>
      )}
      <div className="fc-pstrip" role="list" aria-label="Panels">
        {panels.map((p, i) => {
          const n = i + 1;
          const count = onPanel(n).length;
          return (
            <button
              key={p.image || n}
              type="button"
              role="listitem"
              className={cn("p", n === panel && "on")}
              aria-label={panelName(n)}
              aria-current={n === panel}
              onClick={() => openPanel(n)}
            >
              <img src={panelUrl(review.id, version.number, n)} alt="" loading="lazy" />
              <span className="n">{n}</span>
              {count > 0 && <span className={cn("cc", isOpen ? "draft" : "sent")}>{count}</span>}
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      <ReviewHeader r={r} subline={subline} shortcuts={SHORTCUTS} onPickVersion={pickVersion} />
      <div className={cn("fc-review", (!side.open || side.overlay) && "railed")}>
        <div
          className={cn("fc-stage", view === "board" && "is-board")}
          style={{ "--content-w": view === "board" ? "1200px" : `${Math.max(box.width, 520)}px` } as CSSProperties}
        >
          {toolbar}
          {view === "board" ? board : panelView}
          <ReviewBottom r={r} comments={comments} dock={dock} onLatest={() => pickVersion(latest.number)} />
        </div>
        {(!side.open || side.overlay) && <CommentsRail side={side} count={comments.length} open={isOpen} />}
        <ReviewSidebar
          r={r}
          side={side}
          comments={comments}
          selectedId={selectedId}
          emptyState={emptyState}
          label={label}
          onSelect={(c) => selectComment(c)}
        />
      </div>
    </>
  );
}

import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, Eraser, Loader2, MapPin, MoveHorizontal, Pause, PenLine, Play, Send, ThumbsUp, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import lockup from "../../../public/brand/lockup.svg";
import lockupLight from "../../../public/brand/lockup-light.svg";
import { Menu, MenuItem } from "@/components/menu";
import { CommentList, whenLabel } from "@/components/review/comment-list";
import { burnFrame, DrawLayer, MAX_STROKES, type Stroke } from "@/components/review/drawing";
import { Filmstrip, useTimelineZoom, type Marker } from "@/components/review/filmstrip";
import { Player, type FloatingNote, type MediaController, type Pin } from "@/components/review/player";
import { formatTime, relativeTime, type ReviewComment } from "@/lib/api";
import { LinkClosedError, type CloudShareSource, type Guest, type SharedComment, type SharedReview } from "@/lib/cloud-share";
import { cn } from "@/lib/utils";

const FPS = 30;
const POINT_VISIBLE_FOR = 1.5;
const SITE = "https://www.framejam.ai";

/** What a new comment is attached to. Typing, clicking the frame or drawing pauses the video and stamps the frame. */
type Anchor =
  | { kind: "none" }
  | { kind: "frame"; time: number; x?: number; y?: number; frame?: string }
  | { kind: "range"; time: number; endTime: number }
  | { kind: "panel"; panel: number };

type Ask = null | { then: "add" | "send" | "approve" };

function isAt(c: ReviewComment, t: number) {
  if (c.wholeVideo) return false;
  if (c.endTime !== undefined) return t >= c.time - 0.05 && t <= c.endTime + 0.05;
  return t >= c.time - 0.15 && t <= c.time + POINT_VISIBLE_FOR;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** The link's project kept live from the cloud, and the version on screen. */
function useShare(link: string, data: CloudShareSource) {
  const [review, setReview] = useState<SharedReview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [active, setActive] = useState<number | null>(null);
  const known = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await data.review(link);
      setReview(r);
      setError(null);
      const latest = r.versions.at(-1)!;
      const prev = known.current;
      if (prev && latest.number > prev) {
        toast.success(`Version ${latest.number} is here`, { description: latest.note ? `“${latest.note}”` : undefined });
        setActive((v) => (v === null || v === prev ? latest.number : v));
      }
      known.current = latest.number;
      setActive((v) => v ?? latest.number);
    } catch (e) {
      setError(e);
    }
  }, [link, data]);

  useEffect(() => {
    void load();
    return data.subscribe(link, () => void load());
  }, [link, data, load]);

  const version = review?.versions.find((v) => v.number === active) ?? review?.versions.at(-1);
  return { review, error, load, version, setActive };
}

type ShareState = ReturnType<typeof useShare>;

function Logo() {
  return (
    <a href={SITE} className="fc-logo" aria-label="FrameJam" target="_blank" rel="noreferrer">
      <img className="on-dark" src={lockup} alt="" />
      <img className="on-light" src={lockupLight} alt="" />
    </a>
  );
}

function Closed({ message }: { message: string }) {
  return (
    <div className="fc-share">
      <header className="fc-header">
        <Logo />
      </header>
      <main className="fc-empty fc-center fc-share-closed">
        <div className="fc-h3">
          This link isn't <em>available</em>
        </div>
        <p>{message}</p>
      </main>
    </div>
  );
}

/** `www.framejam.ai/v/<token>`: a shared video or storyboard where guests comment, draw, approve and send. */
export function SharePage({ link, data }: { link: string; data: CloudShareSource }) {
  const s = useShare(link, data);
  const [guest, setGuestState] = useState<Guest | null>(() => data.guest());
  const [ask, setAsk] = useState<Ask>(null);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (s.review) document.title = `${s.review.title} · FrameJam`;
  }, [s.review]);

  /** Runs `action` once the guest has a name and email, asking for them first if needed. */
  const asGuest = (then: NonNullable<Ask>["then"], action: () => void) => {
    if (data.guest()) return action();
    pending.current = action;
    setAsk({ then });
  };

  if (s.error instanceof LinkClosedError || (s.error && !s.review)) {
    return <Closed message={s.error instanceof LinkClosedError ? s.error.message : "Check your connection, then reload this page."} />;
  }
  if (!s.review || !s.version) {
    return (
      <div className="fc-share">
        <header className="fc-header">
          <Logo />
        </header>
        <main className="fc-share-loading">
          <div className="fc-skel" style={{ aspectRatio: "16 / 9", borderRadius: 14 }} />
          <div className="fc-skel" style={{ height: 56 }} />
        </main>
      </div>
    );
  }

  const review = s.review;
  const version = s.version;
  const storyboard = Boolean(version.panels?.length);

  if (review.approved) return <ApprovedShare review={review} data={data} link={link} />;

  return (
    <div className="fc-share">
      <ShareHeader s={s} data={data} link={link} asGuest={asGuest} />
      {storyboard ? (
        <StoryboardShare key={version.number} s={s} data={data} link={link} guest={guest} asGuest={asGuest} onChangeGuest={() => setAsk({ then: "add" })} />
      ) : (
        <VideoShare key={version.number} s={s} data={data} link={link} guest={guest} asGuest={asGuest} onChangeGuest={() => setAsk({ then: "add" })} />
      )}
      {ask && (
        <GuestForm
          initial={guest}
          reason={ask.then}
          onCancel={() => {
            pending.current = null;
            setAsk(null);
          }}
          onSave={(g) => {
            data.setGuest(g);
            setGuestState(data.guest());
            setAsk(null);
            const next = pending.current;
            pending.current = null;
            next?.();
          }}
        />
      )}
      <span hidden data-testid="share-title">
        {review.title}
      </span>
    </div>
  );
}

function ShareHeader({ s, data, link, asGuest }: { s: ShareState; data: CloudShareSource; link: string; asGuest(then: "approve", action: () => void): void }) {
  const review = s.review!;
  const version = s.version!;
  const [approving, setApproving] = useState(false);
  const approvedHere = data.approvedHere(link).includes(version.number);
  const isLatest = version.number === review.versions.at(-1)!.number;
  const approvers = review.approvals.filter((a) => a.version === version.number).map((a) => a.guestName);
  const count = review.versions.length;
  const sub = [
    count > 1 ? `Version ${version.number} of ${count}` : `Version ${version.number}`,
    version.note ? `“${version.note}”` : null,
    relativeTime(version.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");

  const approve = () =>
    asGuest("approve", async () => {
      setApproving(true);
      try {
        await data.approve(link, version.number);
        toast.success(`You approved version ${version.number}`, { description: "Whoever shared this link sees it in FrameJam." });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setApproving(false);
      }
    });

  return (
    <header className="fc-header fc-share-h">
      <Logo />
      <div className="titles">
        <span className="t" title={review.title}>
          {review.title}
        </span>
        <span className="s">{sub}</span>
      </div>
      {count > 1 && (
        <Menu
          label="Versions"
          trigger={
            <button type="button" className="fc-btn ghost sm" data-testid="version-menu">
              v{version.number}
              <ChevronDown className="fc-i xs" />
            </button>
          }
        >
          {[...review.versions].reverse().map((v) => (
            <MenuItem key={v.number} checked={v.number === version.number} hint={relativeTime(v.createdAt)} onSelect={() => s.setActive(v.number)}>
              Version {v.number}
              {v.number === review.versions.at(-1)!.number ? " (latest)" : ""}
            </MenuItem>
          ))}
        </Menu>
      )}
      <button
        type="button"
        className={cn("fc-btn sm", approvedHere ? "ghost" : "outline")}
        disabled={approving || approvedHere || !isLatest}
        onClick={approve}
        title={
          !isLatest
            ? "Open the newest version to approve it"
            : approvers.length
              ? `Approved by ${approvers.join(", ")}`
              : "Tell whoever shared this that this version is good to go. The link then shows only this file."
        }
        data-testid="approve"
      >
        {approving ? <Loader2 className="fc-i xs fc-spin" /> : approvedHere ? <Check className="fc-i xs" /> : <ThumbsUp className="fc-i xs" />}
        <span className="lbl">{approvedHere ? "Approved" : "Approve"}</span>
      </button>
    </header>
  );
}

const dateLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * A link whose version was approved is final: just that file, who approved it and when, and the creator's download if
 * they allow one. No comments, no versions, nothing to approve again.
 */
function ApprovedShare({ review, data, link }: { review: SharedReview; data: CloudShareSource; link: string }) {
  const approved = review.approved!;
  const version = review.versions.find((v) => v.number === approved.version) ?? review.versions.at(-1)!;
  const [saving, setSaving] = useState(false);
  const panels = version.panels ?? [];
  const src = data.videoUrl(link, version.number);

  const download = async () => {
    setSaving(true);
    try {
      await data.download(link);
      toast.success("Your download is starting");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fc-share fc-share-final" data-testid="approved-share">
      <header className="fc-header fc-share-h">
        <Logo />
        <div className="titles">
          <span className="t" title={review.title}>
            {review.title}
          </span>
          <span className="s">Version {version.number}</span>
        </div>
        {approved.download && !panels.length && (
          <button type="button" className="fc-btn primary sm" onClick={download} disabled={saving} data-testid="download">
            {saving ? <Loader2 className="fc-i xs fc-spin" /> : <Download className="fc-i xs" />}
            <span className="lbl">Download</span>
          </button>
        )}
      </header>
      <main className="fc-share-final-body">
        <div className="fc-share-approved big" data-testid="approved-by">
          <Check className="fc-i sm" />
          <span>
            Approved by <b>{approved.by}</b> on {dateLabel(approved.at)}
          </span>
        </div>
        {panels.length ? (
          <div className="fc-share-panels final">
            {panels.map((p, i) => (
              <figure key={i} className="fc-share-panel final">
                <img src={data.panelUrl(link, version.number, i + 1)} alt={p.title ?? `Panel ${i + 1}`} />
                <figcaption>
                  <b>{i + 1}</b> {p.title}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <video className="fc-share-final-video" src={src} poster={review.posters[version.number]} controls playsInline preload="metadata" data-testid="approved-video" />
        )}
        <p className="fc-share-final-note">This version is approved, so comments are closed.{approved.download && !panels.length ? " You can download the original file." : ""}</p>
      </main>
    </div>
  );
}

/** Name and email, asked once, at the guest's first comment (or approval). */
function GuestForm({ initial, reason, onCancel, onSave }: { initial: Guest | null; reason: "add" | "send" | "approve"; onCancel(): void; onSave(g: Guest): void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const valid = name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onSave({ name, email });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fc-share-modal" role="presentation" onClick={onCancel}>
      <form className="fc-share-who" role="dialog" aria-modal="true" aria-labelledby="who-title" onSubmit={submit} onClick={(e) => e.stopPropagation()} data-testid="guest-form">
        <div className="fc-h3" id="who-title">
          {reason === "approve" ? "Who's approving?" : "Who's commenting?"}
        </div>
        <p>Your name shows next to your comments. Your email is only for whoever shared this link.</p>
        <label>
          <span>Name</span>
          <input className="fc-input" autoFocus autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>Email</span>
          <input className="fc-input" type="email" autoComplete="email" inputMode="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <div className="fc-row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button type="button" className="fc-btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="fc-btn primary" disabled={!valid}>
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}

interface DockProps {
  chip: ReactNode;
  text: string;
  placeholder: string;
  whole: boolean;
  wholeLabel: string;
  drawing?: { on: boolean; strokes: number; toggle(): void; clear(): void };
  adding: boolean;
  draftCount: number;
  sending: boolean;
  guest: Guest | null;
  onText(t: string): void;
  onWhole(on: boolean): void;
  onAdd(): void;
  onSend(): void;
  onChangeGuest(): void;
}

/** The comment box: what it's attached to, drawing, the text, and Send for everything written so far. */
const ShareDock = forwardRef<HTMLTextAreaElement, DockProps>(function ShareDock(
  { chip, text, placeholder, whole, wholeLabel, drawing, adding, draftCount, sending, guest, onText, onWhole, onAdd, onSend, onChangeGuest },
  ref,
) {
  const typing = text.trim().length > 0;
  return (
    <div className="fc-dock fc-share-dock">
      <div className="box">
        <div className="tools">
          {chip}
          <span className="fc-grow" />
          {drawing && !whole && (
            <>
              {drawing.strokes > 0 && (
                <button type="button" className="fc-btn ghost sm icon" aria-label="Clear drawing" title="Clear drawing" onClick={drawing.clear}>
                  <Eraser className="fc-i xs" />
                </button>
              )}
              <button
                type="button"
                className={cn("fc-btn ghost sm fc-chip-btn", drawing.on && "on")}
                aria-pressed={drawing.on}
                onClick={drawing.toggle}
                title="Draw on the frame"
                data-testid="draw-toggle"
              >
                <PenLine className="fc-i xs" /> Draw
              </button>
            </>
          )}
          {!whole && (
            <button type="button" className="fc-btn ghost sm fc-chip-btn" onClick={() => onWhole(true)}>
              {wholeLabel}
            </button>
          )}
        </div>
        <div className="entry">
          <textarea
            ref={ref}
            value={text}
            placeholder={placeholder}
            rows={1}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                if (typing) onAdd();
              }
              if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
            }}
            data-testid="comment-box"
          />
          <button type="button" className={cn("fc-btn sm", typing && "primary")} onClick={onAdd} disabled={adding || !typing} data-testid="add-comment">
            {adding ? <Loader2 className="fc-i xs fc-spin" /> : null}
            Add
          </button>
        </div>
      </div>
      <div className="send">
        <span className="fc-share-as fc-grow fc-truncate">
          {guest ? (
            <>
              Commenting as <b>{guest.name}</b>{" "}
              <button type="button" className="fc-link" onClick={onChangeGuest}>
                Change
              </button>
            </>
          ) : draftCount ? (
            "Comments stay in this browser until you send them"
          ) : (
            "Add your comments, then send them together"
          )}
        </span>
        <button
          type="button"
          className={cn("fc-btn", draftCount > 0 && !typing ? "primary" : "outline")}
          disabled={sending || draftCount === 0}
          onClick={onSend}
          title={draftCount ? "Send your comments to whoever shared this link" : "Add a comment first"}
          data-testid="send"
        >
          {sending ? <Loader2 className="fc-i sm fc-spin" /> : <Send className="fc-i sm" />}
          Send{draftCount ? ` ${plural(draftCount, "comment")}` : ""}
        </button>
      </div>
    </div>
  );
});

interface ViewProps {
  s: ShareState;
  data: CloudShareSource;
  link: string;
  guest: Guest | null;
  asGuest(then: "add" | "send", action: () => void): void;
  onChangeGuest(): void;
}

/** Shared by the video and storyboard views: the draft text, adding, sending. */
function useComposer({ s, data, link, asGuest }: ViewProps) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const review = s.review!;
  const drafts = review.comments.filter((c) => c.status === "draft");

  const send = () =>
    asGuest("send", async () => {
      setSending(true);
      try {
        const res = await data.submit(link);
        toast.success(`Sent ${plural(res.batch.commentIds.length, "comment")}`, { description: "Whoever shared this link gets them in FrameJam." });
        await s.load();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setSending(false);
      }
    });

  const add = (make: () => Promise<Parameters<CloudShareSource["addComment"]>[1] | null>, after: () => void) => {
    if (!text.trim() || adding) return;
    asGuest("add", async () => {
      setAdding(true);
      try {
        const body = await make();
        if (!body) return;
        const c = await data.addComment(link, body);
        setText("");
        setSelectedId(c.id);
        after();
        (document.activeElement as HTMLElement | null)?.blur();
        await s.load();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setAdding(false);
      }
    });
  };

  const editable = (c: ReviewComment) => c.status === "draft";
  const save = async (c: ReviewComment, t: string) => {
    await data.updateComment(link, c.id, { text: t });
    await s.load();
  };
  const remove = async (c: ReviewComment) => {
    await data.deleteComment(link, c.id);
    await s.load();
  };
  return { text, setText, adding, sending, send, add, selectedId, setSelectedId, drafts, editable, save, remove };
}

function Approvals({ review, version }: { review: SharedReview; version: number }) {
  const names = review.approvals.filter((a) => a.version === version).map((a) => a.guestName);
  if (!names.length) return null;
  return (
    <div className="fc-share-approved" data-testid="approvals">
      <Check className="fc-i xs" /> Approved by {[...new Set(names)].join(", ")}
    </div>
  );
}

function Side({ title, children, empty, review, version }: { title: string; children: ReactNode; empty: boolean; review: SharedReview; version: number }) {
  return (
    <aside className="fc-share-side">
      <div className="fc-share-side-h">
        <span className="fc-h3">{title}</span>
      </div>
      <div className="fc-share-side-body">
        <Approvals review={review} version={version} />
        {empty ? (
          <div className="fc-side-empty">
            <div className="fc-h3">No comments yet</div>
            <p>Pause anywhere and type, click the video to point at something, or drag across the timeline for a range. Your comments stay here until you press Send.</p>
          </div>
        ) : (
          children
        )}
      </div>
    </aside>
  );
}

function VideoShare(props: ViewProps) {
  const { s, data, link, guest, onChangeGuest } = props;
  const review = s.review!;
  const version = s.version!;
  const c = useComposer(props);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [ctrl, setCtrl] = useState<MediaController | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ kind: "none" });
  const [whole, setWhole] = useState(false);
  const [drawOn, setDrawOn] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [frameWidth, setFrameWidth] = useState(0);

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

  const comments = useMemo(
    () => (review.comments as SharedComment[]).filter((x) => x.version === version.number).sort((a, b) => a.time - b.time || a.createdAt.localeCompare(b.createdAt)),
    [review, version],
  );
  const indexOf = useMemo(() => new Map(comments.map((x, i) => [x.id, i + 1])), [comments]);
  const duration = ctrl?.duration || 0;
  const zoom = useTimelineZoom(duration);

  const here = comments.filter((x) => isAt(x, time));
  const pins: Pin[] = here
    .filter((x) => x.x !== undefined && x.y !== undefined)
    .map((x) => ({ id: x.id, index: indexOf.get(x.id)!, x: x.x!, y: x.y!, sent: x.status !== "draft", text: x.text, author: x.author }));
  const floating: FloatingNote[] = here
    .filter((x) => x.x === undefined || x.y === undefined)
    .map((x) => ({ id: x.id, index: indexOf.get(x.id)!, sent: x.status !== "draft", text: x.text, author: x.author }));
  const shownStrokes = here.flatMap((x) => x.drawing ?? []);
  const markers: Marker[] = comments.map((x) => ({ id: x.id, index: indexOf.get(x.id)!, time: x.time, endTime: x.endTime, whole: x.wholeVideo, sent: x.status !== "draft" }));

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
  const reset = () => {
    setAnchor({ kind: "none" });
    setWhole(false);
    setDrawOn(false);
    setStrokes([]);
  };

  /** Pauses and pins the comment to the frame on screen, unless it's already attached to something. */
  const stamp = (spot?: { x: number; y: number }) => {
    if (!ctrl) return;
    ctrl.pause();
    const t = ctrl.getTime();
    setAnchor((a) => {
      if (spot) return { kind: "frame", time: t, ...spot, frame: ctrl.captureFrame() };
      if (a.kind !== "none") return a;
      return { kind: "frame", time: t, frame: ctrl.captureFrame() };
    });
    setWhole(false);
    c.setSelectedId(null);
  };

  const onText = (t: string) => {
    c.setText(t);
    if (t.trim() && !whole && anchor.kind === "none") stamp();
  };

  const addComment = () =>
    c.add(
      async () => {
        const t = anchor.kind === "frame" || anchor.kind === "range" ? anchor.time : (ctrl?.getTime() ?? time);
        const spot = !whole && anchor.kind === "frame" && anchor.x !== undefined && anchor.y !== undefined ? { x: anchor.x, y: anchor.y } : undefined;
        const base = !whole && anchor.kind === "frame" && anchor.frame ? anchor.frame : ctrl?.captureFrame();
        const drawn = whole ? [] : strokes;
        return {
          version: version.number,
          time: t,
          endTime: !whole && anchor.kind === "range" ? anchor.endTime : undefined,
          x: spot?.x,
          y: spot?.y,
          wholeVideo: whole || undefined,
          text: c.text,
          drawing: drawn.length ? drawn : undefined,
          thumbnailDataUrl: await burnFrame(base, { pin: spot, strokes: drawn }),
        };
      },
      reset,
    );

  const select = (x: ReviewComment) => {
    c.setSelectedId(x.id);
    if (!x.wholeVideo) {
      ctrl?.pause();
      seek(x.time);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true], [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(e.shiftKey ? -FPS : -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(e.shiftKey ? FPS : 1);
      } else if (e.key === "Escape") {
        reset();
        c.setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const chip = whole ? (
    <span className="fc-anchor plain">
      Whole video
      <button type="button" className="x" aria-label="Comment on one moment instead" onClick={() => setWhole(false)}>
        <X className="fc-i xs" />
      </button>
    </span>
  ) : anchor.kind === "frame" ? (
    <span className="fc-anchor" data-testid="anchor">
      {anchor.x !== undefined ? <MapPin className="fc-i xs" /> : <Clock className="fc-i xs" />} {formatTime(anchor.time)}
      {anchor.x !== undefined ? " · on this spot" : " · this frame"}
      <button type="button" className="x" aria-label="Unpin from this frame" onClick={reset}>
        <X className="fc-i xs" />
      </button>
    </span>
  ) : anchor.kind === "range" ? (
    <span className="fc-anchor" data-testid="anchor">
      <MoveHorizontal className="fc-i xs" /> {formatTime(anchor.time)} – {formatTime(anchor.endTime)}
      <button type="button" className="x" aria-label="Remove range" onClick={reset}>
        <X className="fc-i xs" />
      </button>
    </span>
  ) : (
    <span className="fc-anchor plain">
      <Clock className="fc-i xs" /> At {formatTime(time)}
    </span>
  );

  const src = data.videoUrl(link, version.number);
  const aspect = ctrl ? ctrl.width / ctrl.height : 16 / 9;

  return (
    <div className="fc-share-body">
      <div className="fc-share-stage" style={{ "--content-w": `${Math.max(frameWidth, 320)}px` } as CSSProperties}>
        <Player
          src={src}
          pins={pins}
          floating={floating}
          newPin={!whole && anchor.kind === "frame" && anchor.x !== undefined ? { x: anchor.x, y: anchor.y! } : null}
          selectedId={c.selectedId}
          showHint={comments.length === 0 && anchor.kind === "none" && !playing && !drawOn}
          interactive={!drawOn}
          className="fc-share-player"
          style={{ aspectRatio: `${aspect}` }}
          onController={setCtrl}
          onFrameClick={(x, y) => {
            stamp({ x, y });
            requestAnimationFrame(() => boxRef.current?.focus());
          }}
          onPinClick={(id) => {
            const x = comments.find((y) => y.id === id);
            if (x) select(x);
          }}
          onFrameWidth={setFrameWidth}
          errorMessage={src ? "This video couldn't be loaded. Try reloading the page." : "This video isn't available yet."}
        >
          <DrawLayer strokes={drawOn || strokes.length ? strokes : []} shown={shownStrokes} active={drawOn} onStroke={(st) => setStrokes((all) => [...all, st].slice(0, MAX_STROKES))} />
        </Player>
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
          zoom={zoom}
          markers={markers}
          range={!whole && anchor.kind === "range" ? { start: anchor.time, end: anchor.endTime } : null}
          selectedId={c.selectedId}
          frameSource={src || undefined}
          canSelectRange
          wholeActive={whole}
          onSeek={seek}
          onScrubStart={() => ctrl?.pause()}
          onRange={(start, end) => {
            ctrl?.pause();
            setAnchor({ kind: "range", time: start, endTime: end });
            setWhole(false);
            setDrawOn(false);
            setStrokes([]);
            c.setSelectedId(null);
            requestAnimationFrame(() => boxRef.current?.focus());
          }}
          onClearRange={() => setAnchor((a) => (a.kind === "range" ? { kind: "none" } : a))}
          onSelect={(id) => {
            const x = comments.find((y) => y.id === id);
            if (x) select(x);
          }}
        />
        <ShareDock
          ref={boxRef}
          chip={chip}
          text={c.text}
          placeholder={whole ? "What should change in the whole video?" : anchor.kind === "none" ? "Type to comment on this frame…" : "What should change here?"}
          whole={whole}
          wholeLabel="Whole video"
          drawing={{
            on: drawOn,
            strokes: strokes.length,
            toggle: () => {
              if (!drawOn) stamp();
              setDrawOn(!drawOn);
            },
            clear: () => setStrokes([]),
          }}
          adding={c.adding}
          draftCount={c.drafts.length}
          sending={c.sending}
          guest={guest}
          onText={onText}
          onWhole={(on) => {
            setWhole(on);
            if (on) {
              setDrawOn(false);
              setStrokes([]);
            }
            requestAnimationFrame(() => boxRef.current?.focus());
          }}
          onAdd={addComment}
          onSend={c.send}
          onChangeGuest={onChangeGuest}
        />
      </div>
      <Side title={comments.length ? plural(comments.length, "comment") : "Comments"} empty={!comments.length} review={review} version={version.number}>
        <CommentList comments={comments} editable={c.editable} selectedId={c.selectedId} label={whenLabel} onSelect={select} onSave={c.save} onDelete={c.remove} />
      </Side>
    </div>
  );
}

function StoryboardShare(props: ViewProps) {
  const { s, data, link, guest, onChangeGuest } = props;
  const review = s.review!;
  const version = s.version!;
  const c = useComposer(props);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const panels = version.panels ?? [];
  const [panel, setPanel] = useState<number | null>(null);
  const [whole, setWhole] = useState(false);
  const panelRefs = useRef(new Map<number, HTMLElement>());

  const comments = useMemo(
    () => review.comments.filter((x) => x.version === version.number).sort((a, b) => (a.panel ?? 0) - (b.panel ?? 0) || a.createdAt.localeCompare(b.createdAt)),
    [review, version],
  );
  const countOn = (n: number) => comments.filter((x) => x.panel === n && !x.wholeVideo).length;

  useLayoutEffect(() => {
    if (panel) panelRefs.current.get(panel)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [panel]);

  const chip = whole ? (
    <span className="fc-anchor plain">
      Whole storyboard
      <button type="button" className="x" aria-label="Comment on one panel instead" onClick={() => setWhole(false)}>
        <X className="fc-i xs" />
      </button>
    </span>
  ) : panel ? (
    <span className="fc-anchor" data-testid="anchor">
      Panel {panel}
      <button type="button" className="x" aria-label="Unselect panel" onClick={() => setPanel(null)}>
        <X className="fc-i xs" />
      </button>
    </span>
  ) : (
    <span className="fc-anchor plain">Pick a panel</span>
  );

  const addComment = () =>
    c.add(
      async () => {
        if (!whole && !panel) {
          toast.error("Pick a panel first, or comment on the whole storyboard");
          return null;
        }
        return { version: version.number, time: 0, panel: whole ? undefined : panel!, wholeVideo: whole || undefined, kind: whole ? "general" : "panel", text: c.text };
      },
      () => setWhole(false),
    );

  return (
    <div className="fc-share-body">
      <div className="fc-share-stage">
        <div className="fc-share-panels">
          {panels.map((p, i) => {
            const n = i + 1;
            const count = countOn(n);
            return (
              <button
                key={n}
                ref={(el) => {
                  if (el) panelRefs.current.set(n, el);
                }}
                type="button"
                className={cn("fc-share-panel", panel === n && !whole && "is-active")}
                onClick={() => {
                  setPanel(n);
                  setWhole(false);
                  boxRef.current?.focus();
                }}
              >
                <img src={data.panelUrl(link, version.number, n)} alt={p.title ?? `Panel ${n}`} loading="lazy" />
                <span className="cap">
                  <b>{n}</b> {p.title}
                  {count > 0 && <span className="n">{count}</span>}
                </span>
                {p.caption && <span className="d">{p.caption}</span>}
              </button>
            );
          })}
        </div>
        <ShareDock
          ref={boxRef}
          chip={chip}
          text={c.text}
          placeholder={whole ? "What should change in the whole storyboard?" : panel ? `What should change in panel ${panel}?` : "Pick a panel, then type…"}
          whole={whole}
          wholeLabel="Whole storyboard"
          adding={c.adding}
          draftCount={c.drafts.length}
          sending={c.sending}
          guest={guest}
          onText={c.setText}
          onWhole={setWhole}
          onAdd={addComment}
          onSend={c.send}
          onChangeGuest={onChangeGuest}
        />
      </div>
      <Side title={comments.length ? plural(comments.length, "comment") : "Comments"} empty={!comments.length} review={review} version={version.number}>
        <CommentList
          comments={comments}
          editable={c.editable}
          selectedId={c.selectedId}
          label={(x) => (x.wholeVideo ? "Whole storyboard" : `Panel ${x.panel}`)}
          onSelect={(x) => {
            c.setSelectedId(x.id);
            if (x.panel) setPanel(x.panel);
          }}
          onSave={c.save}
          onDelete={c.remove}
        />
      </Side>
    </div>
  );
}

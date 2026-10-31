import { Check, Download, Loader2, Send, ThumbsUp } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { DockPrimary } from "@/components/review/dock";
import type { GuestKit, Heard, MakeComment, MakeVoiceDraft } from "@/components/review/guest";
import { transcribeTake } from "@/components/review/guest";
import { Logo } from "@/components/review/logo";
import { StoryboardReview } from "@/components/review/storyboard";
import { useReview, useWidth, type ReviewState } from "@/components/review/use-review";
import { VideoReview } from "@/components/review/video-review";
import type { VoiceTake } from "@/components/review/voice";
import type { ReviewComment } from "@/lib/api";
import { LinkClosedError, type CloudShareSource, type Guest, type SharedComment, type SharedReview } from "@/lib/cloud-share";
import { cn } from "@/lib/utils";

type Ask = null | { then: "add" | "send" | "approve" };
type AsGuest = (then: NonNullable<Ask>["then"], action: () => void) => void;

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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

/**
 * `www.framejam.ai/v/<token>`: a shared video or storyboard where guests comment, draw, approve and send. It's the
 * creator's review screen with the guest's controls: Send instead of Finish review, Approve, voice and drawing.
 */
export function SharePage({ link, data }: { link: string; data: CloudShareSource }) {
  const resumeTime = useRef(0);
  const r = useReview(link, data, () => {
    resumeTime.current = 0;
  }, "guest");
  const { ref: rootRef, width } = useWidth<HTMLDivElement>();
  const [guest, setGuestState] = useState<Guest | null>(() => data.guest());
  const [ask, setAsk] = useState<Ask>(null);
  const pending = useRef<(() => void) | null>(null);
  const review = r.review as SharedReview | null;

  useEffect(() => {
    if (review) document.title = `${review.title} · FrameJam`;
  }, [review]);

  /** Runs `action` once the guest has a name and email, asking for them first if needed. */
  const asGuest: AsGuest = (then, action) => {
    if (data.guest()) return action();
    pending.current = action;
    setAsk({ then });
  };

  if (r.loadError instanceof LinkClosedError || (r.loadError && !review)) {
    return <Closed message={r.loadError instanceof LinkClosedError ? r.loadError.message : "Check your connection, then reload this page."} />;
  }
  if (!review || !r.version) {
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

  if (review.approved) return <ApprovedShare review={review} data={data} link={link} />;

  return (
    <div className="fc-rshell fc-share" ref={rootRef}>
      <GuestReview r={r} data={data} link={link} guest={guest} width={width} resumeTime={resumeTime} asGuest={asGuest} onChangeGuest={() => setAsk({ then: "add" })} />
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

interface GuestProps {
  r: ReviewState;
  data: CloudShareSource;
  link: string;
  guest: Guest | null;
  width: number;
  resumeTime: { current: number };
  asGuest: AsGuest;
  onChangeGuest(): void;
}

const SEND_PRIMARY: DockPrimary = {
  label: (n) => `Send${n ? ` ${plural(n, "comment")}` : ""}`,
  icon: <Send className="fc-i sm" />,
  testId: "send",
  title: (can) => (can ? "Send your comments to whoever shared this link" : "Add a comment first"),
};

function GuestReview({ r, data, link, guest, width, resumeTime, asGuest, onChangeGuest }: GuestProps) {
  const review = r.review as SharedReview;
  const version = r.version!;
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const busyRef = useRef(false);
  const comments = review.comments as SharedComment[];
  const drafts = comments.filter((c) => c.status === "draft" && !c.unsavedVoice);
  const unsaved = comments.filter((c) => c.status === "draft" && c.unsavedVoice).length;

  /** Recordings whose upload failed, by draft id, for Retry. Gone on reload: then the guest can only type it. */
  const takes = useRef(new Map<string, { take: VoiceTake; make: MakeVoiceDraft }>());
  const [retryable, setRetryable] = useState<ReadonlySet<string>>(new Set());
  const [retrying, setRetrying] = useState<string | null>(null);
  const keepTake = (id: string, kept?: { take: VoiceTake; make: MakeVoiceDraft }) => {
    if (kept) takes.current.set(id, kept);
    else {
      toast.dismiss(`voice-${id}`);
      if (!takes.current.delete(id)) return;
    }
    setRetryable(new Set(takes.current.keys()));
  };

  const addNow = async (make: MakeComment, after: (c: ReviewComment) => void) => {
    const body = await make();
    if (!body) return;
    const c = await data.addComment(link, body);
    after(c);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const add: GuestKit["add"] = (make, after) => {
    if (adding) return;
    asGuest("add", async () => {
      setAdding(true);
      try {
        await addNow(make, after);
        await r.load();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setAdding(false);
      }
    });
  };

  const send: GuestKit["send"] = (pending) =>
    asGuest("send", async () => {
      // One send at a time, so a double click or Cmd+Enter during a send can't send the same drafts twice.
      if (busyRef.current) return;
      busyRef.current = true;
      setSending(true);
      try {
        if (pending) await addNow(pending.make, pending.after);
        const res = await data.submit(link);
        const held = unsaved ? ` ${plural(unsaved, "voice comment")} that wasn't saved stayed here: retry it or send it as text.` : "";
        toast.success(`Sent ${plural(res.batch.commentIds.length, "comment")}`, { description: `Whoever shared this link gets them in FrameJam.${held}` });
        await r.load();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        busyRef.current = false;
        setSending(false);
      }
    });

  /**
   * Uploads and transcribes a take into a draft. When that fails the take still becomes a draft, marked unsaved, so
   * nothing the guest said is dropped; `replacing` is the unsaved draft a retry stands in for.
   */
  const saveTake = async (take: VoiceTake, make: MakeVoiceDraft, replacing?: string) => {
    let heard: Heard | null = null;
    let error = "";
    try {
      heard = await transcribeTake(data, link, take);
    } catch (e) {
      error = (e as Error).message || "The recording couldn't be uploaded.";
    }
    if (replacing) {
      // The guest may have sent the draft as text or deleted it while the retry ran: then there's nothing to replace.
      const still = (await data.review(link)).comments.find((c) => c.id === replacing && c.status === "draft" && (c as SharedComment).unsavedVoice);
      if (!still) {
        keepTake(replacing);
        return;
      }
    }
    const body = await make(heard);
    const created = await data.addComment(link, error ? { ...body, unsavedVoice: { error, duration: take.duration } } : body);
    if (replacing) {
      keepTake(replacing);
      await data.deleteComment(link, replacing).catch(() => {});
    }
    if (error) {
      keepTake(created.id, { take, make });
      toast.error("Your voice comment wasn't saved", {
        id: `voice-${created.id}`,
        description: `${error} It's kept as a draft.`,
        action: { label: "Retry", onClick: () => void retryVoice(created.id) },
      });
    } else if (replacing) {
      toast.success("Voice comment saved");
    }
    await r.load();
  };

  const retryVoice = async (id: string) => {
    const kept = takes.current.get(id);
    if (!kept || busyRef.current) return;
    busyRef.current = true;
    setRetrying(id);
    try {
      await saveTake(kept.take, kept.make, id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      busyRef.current = false;
      setRetrying(null);
    }
  };

  const approve = async (sendFirst: boolean) => {
    setConfirming(false);
    if (busyRef.current) return;
    busyRef.current = true;
    setApproving(true);
    try {
      if (sendFirst && drafts.length) await data.submit(link);
      await data.approve(link, version.number);
      toast.success(`You approved version ${version.number}`, { description: "Whoever shared this link sees it in FrameJam." });
      await r.load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      busyRef.current = false;
      setApproving(false);
    }
  };

  const approvedHere = data.approvedHere(link).includes(version.number);
  const approvers = [...new Set(review.approvals.filter((a) => a.version === version.number).map((a) => a.guestName))];

  const kit: GuestKit = {
    status: (
      <span className="fc-share-as fc-grow fc-truncate">
        {guest ? (
          <>
            Commenting as <b>{guest.name}</b>{" "}
            <button type="button" className="fc-link" onClick={onChangeGuest}>
              Change
            </button>
          </>
        ) : drafts.length ? (
          "Comments stay in this browser until you send them"
        ) : (
          "Add your comments, then send them together"
        )}
      </span>
    ),
    primary: SEND_PRIMARY,
    draftCount: drafts.length,
    busy: sending || approving || retrying !== null,
    adding,
    add,
    send,
    startVoice: (start) => asGuest("add", start),
    addTake: async (take, make, after) => {
      await saveTake(take, make);
      after();
    },
    rules: {
      editable: (c) => c.status === "draft" && !c.voice,
      onSave: async (c, text) => {
        try {
          await data.updateComment(link, c.id, { text });
          keepTake(c.id);
          await r.load();
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
      onDelete: async (c) => {
        try {
          await data.deleteComment(link, c.id);
          keepTake(c.id);
          await r.load();
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
      frameUrl: (file) => file,
      footer: (comment, { edit }) => {
        const u = (comment as SharedComment).unsavedVoice;
        if (!u || comment.status !== "draft") return null;
        return <UnsavedVoiceNotice unsaved={u} canRetry={retryable.has(comment.id)} retrying={retrying === comment.id} onRetry={() => void retryVoice(comment.id)} onType={edit} />;
      },
    },
    before: approvers.length ? (
      <div className="fc-share-approved" data-testid="approvals">
        <Check className="fc-i xs" /> Approved by {approvers.join(", ")}
      </div>
    ) : undefined,
    actions: (
      <>
        <button
          type="button"
          className={cn("fc-btn sm", approvedHere ? "ghost" : "outline")}
          disabled={approving || approvedHere || !r.isLatest}
          onClick={() =>
            asGuest("approve", () => {
              // Toasts sit above the modal, so on a short window an old one could cover the dialog.
              toast.dismiss();
              setConfirming(true);
            })
          }
          title={
            !r.isLatest
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
        {confirming && <ApproveConfirm version={version.number} drafts={drafts.length} onCancel={() => setConfirming(false)} onApprove={(sendFirst) => void approve(sendFirst)} />}
      </>
    ),
  };

  return version.panels?.length ? (
    <StoryboardReview r={r} width={width} role="guest" guest={kit} />
  ) : (
    <VideoReview r={r} width={width} resumeTime={resumeTime} role="guest" guest={kit} />
  );
}

/** Approving closes the link for everyone, so it asks first, and offers to send what the guest hasn't sent yet. */
function ApproveConfirm({ version, drafts, onCancel, onApprove }: { version: number; drafts: number; onCancel(): void; onApprove(sendFirst: boolean): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  // Rendered from the header, whose backdrop-filter would make it the box a fixed overlay fills.
  return createPortal(
    <div className="fc-share-modal" role="presentation" onClick={onCancel}>
      <div className="fc-share-who" role="dialog" aria-modal="true" aria-labelledby="approve-title" onClick={(e) => e.stopPropagation()} data-testid="approve-confirm">
        <div className="fc-h3" id="approve-title">
          Approve version {version}?
        </div>
        <p>Comments close for everyone on this link, and it shows only this version from then on.</p>
        {drafts > 0 && (
          <p>
            You have <b>{plural(drafts, "comment")}</b> you haven't sent.
          </p>
        )}
        <div className="fc-row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <button type="button" className="fc-btn ghost" onClick={onCancel}>
            Cancel
          </button>
          {drafts > 0 ? (
            <>
              <button type="button" className="fc-btn outline" onClick={() => onApprove(false)} data-testid="approve-confirm-yes">
                Approve without them
              </button>
              <button type="button" className="fc-btn primary" autoFocus onClick={() => onApprove(true)} data-testid="approve-send-first">
                Send and approve
              </button>
            </>
          ) : (
            <button type="button" className="fc-btn primary" autoFocus onClick={() => onApprove(false)} data-testid="approve-confirm-yes">
              Approve
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
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

/** A voice draft whose recording didn't reach FrameJam: why, and the two ways on. */
function UnsavedVoiceNotice({ unsaved, canRetry, retrying, onRetry, onType }: { unsaved: { error: string }; canRetry: boolean; retrying: boolean; onRetry(): void; onType(): void }) {
  return (
    <div className="fc-voice-unsaved" role="alert" data-testid="voice-unsaved" onClick={(e) => e.stopPropagation()}>
      <p>
        <b>Voice not saved.</b> {unsaved.error}
        {canRetry ? "" : " The recording was lost when the page reloaded."}
      </p>
      <div className="fc-row">
        {canRetry && (
          <button type="button" className="fc-btn sm primary" disabled={retrying} onClick={onRetry} data-testid="voice-retry">
            {retrying ? <Loader2 className="fc-i xs fc-spin" /> : null}
            {retrying ? "Retrying…" : "Retry"}
          </button>
        )}
        <button type="button" className="fc-btn ghost sm" disabled={retrying} onClick={onType} data-testid="voice-as-text">
          Send as text instead
        </button>
      </div>
    </div>
  );
}

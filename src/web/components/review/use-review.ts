import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, copyText, handoffMessage, type Review, type ReviewComment } from "@/lib/api";

/** Width of whichever element the returned ref is attached to (the page swaps roots while loading). */
export function useWidth<T extends HTMLElement>() {
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

/**
 * A review kept live over SSE, the version on screen, and the round actions (finish, reopen, edit, delete).
 * `onNewVersion` runs when the agent ships a version while you're following the latest one.
 */
export function useReview(id: string, onNewVersion?: () => void) {
  const [review, setReview] = useState<Review | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  /** The handoff line went to the clipboard when this round was finished. */
  const [autoCopied, setAutoCopied] = useState(false);
  const knownLatest = useRef(0);
  const onNewVersionRef = useRef(onNewVersion);
  useLayoutEffect(() => {
    onNewVersionRef.current = onNewVersion;
  });

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
        onNewVersionRef.current?.();
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

  const version = review?.versions.find((v) => v.number === activeVersion) ?? review?.versions.at(-1);
  const latest = review?.versions.at(-1);
  const isLatest = Boolean(version && latest && version.number === latest.number);
  const isOpen = isLatest && !version?.sentAt;

  const finish = async () => {
    if (!review || finishing) return;
    setFinishing(true);
    try {
      const res = await api.submit(review.id);
      const n = res.batch.commentIds.length;
      if (res.agentListening) {
        toast.success("Your agent has your comments", { description: `${n} comment${n === 1 ? "" : "s"}, handed over instantly.` });
      } else {
        // Copy right away, while the click or keypress that finished the review still allows clipboard access.
        const ok = await copyText(handoffMessage(review.id)).then(
          () => true,
          () => false,
        );
        setAutoCopied(ok);
        if (ok) toast.success("Copied. Paste it into your agent chat", { description: handoffMessage(review.id) });
      }
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFinishing(false);
    }
  };

  const reopen = async () => {
    if (!review) return;
    try {
      const res = await api.reopen(review.id);
      setReview(res.review);
      setAutoCopied(false);
      toast.success("Review reopened", {
        description: res.wasDelivered ? "Edit your comments, then finish again. Your agent gets the new list." : "Edit your comments, then finish again.",
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveComment = async (c: ReviewComment, text: string) => {
    if (!review) return;
    try {
      await api.updateComment(review.id, c.id, { text });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const deleteComment = async (c: ReviewComment) => {
    if (!review) return;
    try {
      await api.deleteComment(review.id, c.id);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return { review, loadError, load, version, latest, isLatest, isOpen, setActiveVersion, finishing, finish, autoCopied, reopen, saveComment, deleteComment };
}

export type ReviewState = ReturnType<typeof useReview>;

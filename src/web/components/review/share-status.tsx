import { Check, Copy, Link2, Link2Off, Loader2, Share2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/menu";
import { copyText, relativeTime, type ShareInfo } from "@/lib/api";
import type { ReviewDataSource } from "@/lib/data-source";
import { cn } from "@/lib/utils";

/**
 * The creator's view of the project's share link, in the review header: whether a guest approved, whether the link
 * still works, and the two switches (download, stop sharing). Nothing shows for a project that isn't shared.
 */
export function ShareStatus({ data, reviewId, latestVersion }: { data: ReviewDataSource; reviewId: string; latestVersion?: number }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const read = data.share;

  const load = useCallback(async () => {
    if (!read) return;
    try {
      setInfo(await read(reviewId));
    } catch {
      setInfo(null);
    }
  }, [read, reviewId]);

  useEffect(() => {
    if (!read) return;
    void load();
    return data.subscribe(reviewId, () => void load());
  }, [data, reviewId, load, read]);

  const [publishing, setPublishing] = useState(false);
  const publish = async (version?: number) => {
    if (!data.publishShare || publishing) return;
    setPublishing(true);
    try {
      const next = await data.publishShare(reviewId, version);
      setInfo(next);
      toast.success(version ? `Version ${version} is on the link` : "Your share link is ready", { description: next.url });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  if (info && !info.shared && data.publishShare) {
    return (
      <button type="button" className="fc-btn sm" onClick={() => void publish()} disabled={publishing} data-testid="share-create">
        {publishing ? <Loader2 className="fc-i xs fc-spin" /> : <Share2 className="fc-i xs" />}
        <span className="lbl">Share</span>
      </button>
    );
  }
  if (!info?.shared || !data.setShare) return null;
  const approved = info.approved;
  const closed = Boolean(info.closed);
  const set = async (change: { allowDownload?: boolean; revoked?: boolean; expiresAt?: number | null; showNotes?: boolean }, message?: string) => {
    try {
      setInfo(await data.setShare!(reviewId, change));
      toast.success(
        message ??
          (change.revoked
            ? "The link is turned off"
            : change.showNotes !== undefined
              ? change.showNotes
                ? "Guests can read the version notes"
                : "Version notes are hidden from guests"
              : change.allowDownload
                ? "Guests can download the approved file"
                : "Guests can't download the approved file"),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const newest = Math.max(0, ...(info.versions ?? []));
  const expireIn = (days: number | null) =>
    void set({ expiresAt: days === null ? null : Date.now() + days * 86_400_000 }, days === null ? "The link no longer expires" : `The link works for ${days} days`);
  const opens = typeof info.opens === "number" ? info.opens : undefined;
  const opened = opens ? `Opened ${opens} time${opens === 1 ? "" : "s"}` : undefined;
  const label = closed ? (info.revokedAt ? "Link turned off" : "Link expired") : approved ? `Approved by ${approved.by}` : (opened ?? "Shared");
  const openedLine =
    opens === undefined
      ? undefined
      : opens === 0
        ? "Nobody has opened it yet"
        : `${opened}${info.lastOpenedAt ? `, last ${relativeTime(new Date(info.lastOpenedAt).toISOString())}` : ""}`;

  return (
    <Menu
      label="Share link"
      trigger={
        <button type="button" className={cn("fc-btn sm fc-share-chip", approved && !closed && "approved", closed && "closed")} data-testid="share-status">
          {closed ? <Link2Off className="fc-i xs" /> : approved ? <Check className="fc-i xs" /> : <Link2 className="fc-i xs" />}
          <span className="lbl">{label}</span>
        </button>
      }
    >
      <MenuLabel>
        {closed
          ? "Guests can't open this link"
          : approved
            ? `Version ${approved.version} approved ${relativeTime(new Date(approved.at).toISOString())}. The link shows only that file.`
            : "Guests can comment and approve"}
      </MenuLabel>
      {openedLine && <MenuLabel>{openedLine}</MenuLabel>}
      <MenuItem
        icon={<Copy className="fc-i sm" />}
        onSelect={async () => {
          await copyText(info.url ?? "");
          toast.success("Link copied");
        }}
      >
        Copy link
      </MenuItem>
      {closed && data.shareSettings && (
        <MenuItem
          icon={<Link2 className="fc-i sm" />}
          onSelect={() => void set({ revoked: false, ...(info.expiresAt && info.expiresAt <= Date.now() ? { expiresAt: null } : {}) }, "The link is on again")}
        >
          Turn link back on
        </MenuItem>
      )}
      {!closed && data.publishShare && latestVersion !== undefined && newest < latestVersion && (
        <MenuItem icon={<Share2 className="fc-i sm" />} onSelect={() => void publish(latestVersion)}>
          Put v{latestVersion} on the link
        </MenuItem>
      )}
      {!closed && (
        <>
          <MenuSeparator />
          <MenuItem checked={info.allowDownload !== false} hint="after approval" onSelect={() => void set({ allowDownload: info.allowDownload === false })}>
            Allow download
          </MenuItem>
          {data.shareSettings && (
            <MenuItem checked={info.showNotes === true} hint="never the source" onSelect={() => void set({ showNotes: info.showNotes !== true })}>
              Show version notes
            </MenuItem>
          )}
          {data.shareSettings && (
            <>
              <MenuLabel>{info.expiresAt ? `Expires ${new Date(info.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "Never expires"}</MenuLabel>
              <MenuItem onSelect={() => expireIn(7)}>Expire in 7 days</MenuItem>
              <MenuItem onSelect={() => expireIn(30)}>Expire in 30 days</MenuItem>
              {info.expiresAt && <MenuItem onSelect={() => expireIn(null)}>Never expire</MenuItem>}
            </>
          )}
          <MenuItem
            danger
            icon={<Link2Off className="fc-i sm" />}
            onSelect={() => {
              if (window.confirm("Turn this link off for everyone? Guests who open it will see that it doesn't work anymore.")) void set({ revoked: true });
            }}
          >
            Turn off link
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

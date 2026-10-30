import { Check, Copy, Link2, Link2Off } from "lucide-react";
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
export function ShareStatus({ data, reviewId }: { data: ReviewDataSource; reviewId: string }) {
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

  if (!info?.shared || !data.setShare) return null;
  const approved = info.approved;
  const closed = Boolean(info.closed);
  const set = async (change: { allowDownload?: boolean; revoked?: boolean }) => {
    try {
      setInfo(await data.setShare!(reviewId, change));
      toast.success(change.revoked ? "The link is turned off" : change.allowDownload ? "Guests can download the approved file" : "Guests can't download the approved file");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
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
      {!closed && (
        <>
          <MenuSeparator />
          <MenuItem checked={info.allowDownload !== false} hint="after approval" onSelect={() => void set({ allowDownload: info.allowDownload === false })}>
            Allow download
          </MenuItem>
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

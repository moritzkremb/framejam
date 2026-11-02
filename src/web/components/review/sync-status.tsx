import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/menu";
import { api, relativeTime, type SyncStatus } from "@/lib/api";

const LABEL: Record<SyncStatus["state"], string> = {
  off: "",
  "signed-out": "Signed out",
  "left-out": "Not synced",
  syncing: "Syncing",
  synced: "Synced",
  paused: "Not syncing",
  offline: "Offline",
};

/**
 * Whether this project syncs with FrameJam Cloud, in the review header of the local app, with the switch that leaves
 * it out. Nothing shows while sync is off on this computer.
 */
export function SyncStatusButton({ reviewId }: { reviewId: string }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api.projectSync(reviewId));
    } catch {
      setStatus(null);
    }
  }, [reviewId]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  if (!status || status.state === "off") return null;

  const change = async (synced: boolean) => {
    if (!synced && !window.confirm("Stop syncing this project? Its copy in FrameJam Cloud is removed. It stays on this computer.")) return;
    setBusy(true);
    try {
      setStatus(await api.setProjectSync(reviewId, synced));
      toast.success(synced ? "This project syncs again" : "This project stays on this computer");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const on = status.state === "synced" || status.state === "syncing";
  const up = status.upload;
  const trigger = (
    <button type="button" className="fc-btn sm" aria-label="Sync" data-testid="sync-status" data-state={status.state}>
      {busy || status.state === "syncing" ? <Loader2 className="fc-i xs fc-spin" /> : on ? <Cloud className="fc-i xs" /> : <CloudOff className="fc-i xs" />}
      <span className="lbl">{up ? `Uploading v${up.version} · ${Math.round((up.bytes / Math.max(1, up.total)) * 100)}%` : LABEL[status.state]}</span>
    </button>
  );
  return (
    <Menu label="Sync" trigger={trigger}>
      <MenuLabel>FrameJam Cloud</MenuLabel>
      <div className="fc-menu-note" style={{ padding: "4px 10px 8px", maxWidth: 260 }}>
        <span className="fc-caption">
          {status.state === "paused" || status.state === "offline"
            ? (status.error ?? "This project isn't syncing right now.")
            : status.state === "signed-out"
              ? "Sign in to sync: run framejam login in a terminal."
              : status.state === "left-out"
                ? "This project stays on this computer."
                : status.syncedAt
                  ? `Synced ${relativeTime(status.syncedAt)}. Open it on your phone at app.framejam.ai.`
                  : "Syncing for the first time."}
        </span>
      </div>
      <MenuSeparator />
      {status.state === "left-out" ? (
        <MenuItem icon={<Cloud className="fc-i sm" />} onSelect={() => void change(true)}>
          Sync this project
        </MenuItem>
      ) : (
        <MenuItem icon={<CloudOff className="fc-i sm" />} danger onSelect={() => void change(false)}>
          Don't sync this project
        </MenuItem>
      )}
    </Menu>
  );
}

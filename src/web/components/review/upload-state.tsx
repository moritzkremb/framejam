import { CloudAlert, CloudUpload } from "lucide-react";
import type { ReviewVersion } from "@/lib/api";

const MB = 1024 * 1024;

function size(bytes: number) {
  return bytes >= 1024 * MB ? `${(bytes / (1024 * MB)).toFixed(1)} GB` : `${Math.max(0.1, bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`;
}

/**
 * A cloud project's version whose files are still on their way to FrameJam Cloud. You can keep reviewing the copy on
 * this computer; the version plays for anyone you share it with, or on another computer, once this is gone.
 */
export function UploadState({ version }: { version: ReviewVersion }) {
  const u = version.upload;
  if (!u) return null;
  if (u.state === "failed") {
    return (
      <div className="fc-upload failed" role="status" data-testid="upload-state" data-state="failed">
        <CloudAlert className="fc-i" />
        <div className="body">
          <div className="line">
            <strong>v{version.number} didn't finish uploading</strong>
          </div>
          <div className="note">{u.error ? `${u.error} ` : ""}FrameJam tries again when it restarts, or ask your agent to open it again. You can keep reviewing here meanwhile.</div>
        </div>
      </div>
    );
  }
  const pct = u.total > 0 ? Math.min(100, Math.floor((u.bytes / u.total) * 100)) : 0;
  return (
    <div className="fc-upload" role="status" aria-live="polite" data-testid="upload-state" data-state="uploading">
      <CloudUpload className="fc-i" />
      <div className="body">
        <div className="line">
          <strong>Uploading v{version.number} to FrameJam Cloud</strong>
          <span className="count">
            {pct}%{u.total > 0 ? ` · ${size(u.bytes)} of ${size(u.total)}` : ""}
          </span>
        </div>
        <div className="fc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="note">You can keep reviewing. It plays for anyone you share it with once it's done.</div>
      </div>
    </div>
  );
}

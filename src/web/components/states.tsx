import { Search, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/setup-steps";

export function NotHere({ title, message, back = "/projects", backLabel = "Back to projects" }: { title: string; message: string; back?: string; backLabel?: string }) {
  return (
    <div className="fc-empty fc-center">
      <span className="ic">
        <Search className="fc-i" />
      </span>
      <div className="fc-h3">{title}</div>
      <p>{message}</p>
      <Link to={back} className="fc-btn" style={{ marginTop: 8 }}>
        {backLabel}
      </Link>
    </div>
  );
}

export function Offline() {
  return (
    <div className="fc-empty fc-center">
      <span className="ic" style={{ color: "var(--danger)", background: "var(--danger-soft)" }}>
        <WifiOff className="fc-i" />
      </span>
      <div className="fc-h3">Frame Jam isn't running</div>
      <p>Start it again in your terminal, and this page reconnects by itself.</p>
      <div style={{ marginTop: 8, width: "100%", maxWidth: 320 }}>
        <CodeBlock code="npx framejam" />
      </div>
    </div>
  );
}

/** True when a fetch failed because the server is down, not because of an app error. */
export function isOffline(err: unknown) {
  return err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String((err as Error)?.message));
}

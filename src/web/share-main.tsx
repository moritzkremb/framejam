import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { cloudShareSource, convexShareBackend } from "@/lib/cloud-share";
import { SharePage } from "@/pages/share-page";
import "./index.css";
import "./styles/share.css";

/**
 * Entry of the share page build (`npm run build:share`), served by FrameJam Cloud at `/v/<token>`. The host fills in
 * the Convex URL in `share/index.html`; `VITE_CONVEX_URL` is for running it locally.
 */
function convexUrl(): string | undefined {
  const fromHost = document.querySelector<HTMLMetaElement>('meta[name="framejam-convex-url"]')?.content;
  if (fromHost && !fromHost.startsWith("__")) return fromHost;
  return import.meta.env.VITE_CONVEX_URL as string | undefined;
}

function applyTheme() {
  const light = window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = light ? "light" : "dark";
}
applyTheme();
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);

const link = decodeURIComponent(window.location.pathname.match(/\/v\/([^/]+)/)?.[1] ?? "");
const url = convexUrl();
const root = createRoot(document.getElementById("root")!);

if (!url || !link) {
  root.render(
    <main className="fc-empty fc-center" style={{ minHeight: "100dvh", justifyContent: "center" }}>
      <div className="fc-h3">This link isn't available</div>
      <p>{url ? "The link looks incomplete. Check that you copied all of it." : "Sharing isn't set up on this server."}</p>
    </main>,
  );
} else {
  const data = cloudShareSource(convexShareBackend(url));
  root.render(
    <StrictMode>
      <SharePage link={link} data={data} />
      <Toaster
        position="top-center"
        offset={64}
        toastOptions={{ unstyled: true, classNames: { toast: "fc-toast", title: "t", description: "d", actionButton: "fc-btn sm", icon: "ic" } }}
      />
    </StrictMode>,
  );
}

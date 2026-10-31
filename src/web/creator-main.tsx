import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { CrashScreen } from "@/components/crash-screen";
import { convexCreatorBackend, creatorSource } from "@/lib/cloud-creator";
import { ReviewPage } from "@/pages/review-page";
import "./index.css";

/**
 * Entry of the creator build (`npm run build:creator`), served by FrameJam Cloud at `/p/<id>` to signed-in creators.
 * The host fills in the Convex URL and the share-link origin in `creator/index.html` and answers `/api/convex-token`
 * with a fresh Clerk token for Convex, so this bundle carries no sign-in code of its own.
 */
function meta(name: string): string | undefined {
  const value = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
  return value && !value.startsWith("__") ? value : undefined;
}

// framejam.ai is dark only; set here too in case the host serves its own copy of index.html.
document.documentElement.dataset.theme = "dark";

async function fetchToken(): Promise<string | null> {
  const res = await fetch("/api/convex-token", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) return null;
  return ((await res.json()) as { token?: string | null }).token ?? null;
}

/** The review page's back arrow and wordmark point at "/", which is the project list on the host. */
function Leave() {
  window.location.replace("/projects");
  return null;
}

const id = decodeURIComponent(window.location.pathname.match(/\/p\/([^/]+)/)?.[1] ?? "");
const url = meta("framejam-convex-url") ?? (import.meta.env.VITE_CONVEX_URL as string | undefined);
const root = createRoot(document.getElementById("root")!);

if (!url || !id) {
  root.render(
    <main className="fc-empty fc-center" style={{ minHeight: "100dvh", justifyContent: "center" }}>
      <div className="fc-h3">This project isn't available</div>
      <p>{url ? "The link looks incomplete." : "FrameJam Cloud isn't set up on this server."}</p>
    </main>,
  );
} else {
  const data = creatorSource(convexCreatorBackend(url, () => fetchToken()), { shareOrigin: meta("framejam-share-origin") });
  root.render(
    <StrictMode>
      <CrashScreen>
        <MemoryRouter initialEntries={[`/review/${id}`]}>
          <Routes>
            <Route path="/review/:id" element={<ReviewPage data={data} role="owner" />} />
            <Route path="*" element={<Leave />} />
          </Routes>
        </MemoryRouter>
      </CrashScreen>
      <Toaster
        position="top-center"
        offset={64}
        toastOptions={{ unstyled: true, classNames: { toast: "fc-toast", title: "t", description: "d", actionButton: "fc-btn sm", icon: "ic" } }}
      />
    </StrictMode>,
  );
}

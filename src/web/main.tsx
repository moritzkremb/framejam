import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { NotFoundPage } from "@/pages/not-found-page";
import { PlaybookDetailPage } from "@/pages/playbook-detail-page";
import { PlaybooksPage } from "@/pages/playbooks-page";
import { ReviewPage } from "@/pages/review-page";
import { ProjectsPage } from "@/pages/projects-page";
import { SetupPage } from "@/pages/setup-page";
import { StyleDetailPage } from "@/pages/style-detail-page";
import { StylesPage } from "@/pages/styles-page";
import "./index.css";

/** Dark by default; follows the harness / OS when it asks for light. */
function applyTheme() {
  const light = window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = light ? "light" : "dark";
}
applyTheme();
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);

/** Old /presets links (from agents and bookmarks) keep working. */
function PresetRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/styles/${id}` : "/styles"} replace />;
}

/** The old landing page: /home#setup now lives at /setup, everything else at the dashboard. */
function OldHomeRedirect() {
  const { hash } = useLocation();
  return <Navigate to={hash === "#setup" ? "/setup" : "/"} replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/styles" element={<StylesPage />} />
        <Route path="/styles/:id" element={<StyleDetailPage />} />
        <Route path="/playbooks" element={<PlaybooksPage />} />
        <Route path="/playbooks/:id" element={<PlaybookDetailPage />} />
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route path="/reviews" element={<Navigate to="/" replace />} />
        <Route path="/projects" element={<Navigate to="/" replace />} />
        <Route path="/home" element={<OldHomeRedirect />} />
        <Route path="/presets" element={<PresetRedirect />} />
        <Route path="/presets/:id" element={<PresetRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
    <Toaster
      position="top-center"
      offset={64}
      toastOptions={{ unstyled: true, classNames: { toast: "fc-toast", title: "t", description: "d", actionButton: "fc-btn sm", icon: "ic" } }}
    />
  </StrictMode>,
);

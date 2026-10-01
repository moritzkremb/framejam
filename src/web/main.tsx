import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { HomePage } from "@/pages/home-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { ReviewPage } from "@/pages/review-page";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route path="/styles" element={<StylesPage />} />
        <Route path="/styles/:id" element={<StyleDetailPage />} />
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

// ⚠️ MUST BE FIRST
import "./polyfills";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { useAppStore } from "./store";

// ---------------- THEME BOOTSTRAP ----------------
const { theme: storeTheme } = useAppStore.getState();

let bootTheme = storeTheme;

try {
  const saved = localStorage.getItem("crolana-theme");
  if (saved) {
    const p = JSON.parse(saved);
    if (p.bgBase && p.accentPrimary) {
      if (!p.bgRaised) p.bgRaised = p.bgSurface;
      bootTheme = p;
    }
  }
} catch {}

const r = document.documentElement;

r.style.setProperty("--bg-base", bootTheme.bgBase);
r.style.setProperty("--bg-surface", bootTheme.bgSurface);
r.style.setProperty("--bg-elevated", bootTheme.bgElevated);
r.style.setProperty("--bg-sidebar", bootTheme.bgSidebar);
r.style.setProperty("--bg-raised", bootTheme.bgRaised ?? bootTheme.bgSurface);
r.style.setProperty("--border-color", bootTheme.borderColor);
r.style.setProperty("--text-primary", bootTheme.textPrimary);
r.style.setProperty("--text-secondary", bootTheme.textSecondary);
r.style.setProperty("--text-muted", bootTheme.textMuted);
r.style.setProperty("--accent-primary", bootTheme.accentPrimary);
r.style.setProperty("--accent-hover", bootTheme.accentHover);
r.style.setProperty("--accent-text", bootTheme.accentText);
r.style.setProperty("--color-success", bootTheme.colorSuccess);
r.style.setProperty("--color-warning", bootTheme.colorWarning);
r.style.setProperty("--color-error", bootTheme.colorError);
r.style.setProperty("--color-info", bootTheme.colorInfo);

// ---------------- RENDER ----------------
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
// ⚠️ MUST be first — polyfills Buffer + process globals before any Solana code
import './polyfills';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { useAppStore } from './store';

// ── Apply saved/default theme CSS variables on first load ────────────────────
const { theme: storeTheme } = useAppStore.getState();
let bootTheme = storeTheme;
try {
  const saved = localStorage.getItem('crolana-theme');
  if (saved) {
    const p = JSON.parse(saved);
    if (p.bgBase && p.accentPrimary) {
      if (!p.bgRaised) p.bgRaised = p.bgSurface;
      bootTheme = p;
    }
  }
} catch (_) {}

const r = document.documentElement;
r.style.setProperty('--bg-base',        bootTheme.bgBase);
r.style.setProperty('--bg-surface',     bootTheme.bgSurface);
r.style.setProperty('--bg-elevated',    bootTheme.bgElevated);
r.style.setProperty('--bg-sidebar',     bootTheme.bgSidebar);
r.style.setProperty('--bg-raised',      bootTheme.bgRaised ?? bootTheme.bgSurface);
r.style.setProperty('--border-color',   bootTheme.borderColor);
r.style.setProperty('--text-primary',   bootTheme.textPrimary);
r.style.setProperty('--text-secondary', bootTheme.textSecondary);
r.style.setProperty('--text-muted',     bootTheme.textMuted);
r.style.setProperty('--accent-primary', bootTheme.accentPrimary);
r.style.setProperty('--accent-hover',   bootTheme.accentHover);
r.style.setProperty('--accent-text',    bootTheme.accentText);
r.style.setProperty('--color-success',  bootTheme.colorSuccess);
r.style.setProperty('--color-warning',  bootTheme.colorWarning);
r.style.setProperty('--color-error',    bootTheme.colorError);
r.style.setProperty('--color-info',     bootTheme.colorInfo);

// ── Mount React ───────────────────────────────────────────────────────────────
// Wrapped in try-catch so that if something throws during the initial render
// (e.g. a polyfill issue on a very old mobile browser) the global error handler
// in index.html can display a visible fallback instead of leaving a blank page.
try {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element #root not found in DOM');

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // Signal to the global error handler (index.html) that React mounted OK.
  // After this point the ChunkErrorBoundary in App.tsx handles future errors.
  if (typeof (window as any).__markAppMounted === 'function') {
    (window as any).__markAppMounted();
  }
} catch (err) {
  console.error('[main] Failed to mount React app:', err);

  // Show inline fallback — the global onerror handler may not fire for
  // errors thrown inside a try-catch block.
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                  background:#020817;padding:1.5rem;font-family:system-ui,sans-serif;">
        <div style="text-align:center;max-width:380px;color:#94a3b8;">
          <div style="font-size:3rem;margin-bottom:1rem">⚠️</div>
          <h2 style="color:#f1f5f9;margin:0 0 .5rem;font-size:1.2rem">App failed to start</h2>
          <p style="font-size:.9rem;margin:0 0 1.5rem">
            ${(err instanceof Error ? err.message : String(err)).substring(0, 200)}
          </p>
          <button onclick="location.reload()"
            style="background:#3b82f6;color:#fff;border:none;border-radius:8px;
                   padding:.6rem 1.5rem;font-size:.9rem;cursor:pointer">
            Reload
          </button>
        </div>
      </div>
    `;
  }
}

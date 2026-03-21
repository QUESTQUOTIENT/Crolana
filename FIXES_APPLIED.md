# Cronos Studio — Audit Fixes Applied

**Audit Date:** March 2026  
**Original Version:** v7.1.0  
**Fixed Version:** v7.1.1

---

## Summary of All Fixes

### 🔴 Critical Fixes

#### FIX-01 — authController.ts: JWT Secret randomizes on every restart
- **Problem:** `crypto.randomBytes(32).toString('hex')` was used as the default JWT secret fallback, meaning every server restart invalidated ALL user sessions. Also used a hand-rolled JWT implementation instead of the installed `jsonwebtoken` package.
- **File:** `server/controllers/authController.ts`
- **Fix:** Now uses stable constant `JWT_SECRET` from `.env`. In production, exits with clear error if not set. Replaced hand-rolled JWT with `jsonwebtoken` package (already installed). Added periodic nonce map cleanup to prevent memory leak.

#### FIX-02 — vite.config.ts: `process.env` blanket override wiped all defined keys
- **Problem:** `define: { 'process.env': JSON.stringify({}) }` was declared after `'process.env.GEMINI_API_KEY'`, silently overwriting it with an empty object. Any code relying on `process.env.NODE_ENV` in the browser bundle also broke.
- **File:** `vite.config.ts`
- **Fix:** Removed blanket override. Now defines only `process.env.NODE_ENV` and `process.env.BROWSER` explicitly, plus the `global: 'globalThis'` polyfill.

#### FIX-03 — multer 2.x breaking change: `dest` shorthand removed
- **Problem:** multer 2.x removed the `{ dest: 'uploads/' }` shorthand option. Using it causes a runtime crash when any file upload is attempted — the entire IPFS upload and storage system breaks.
- **Files:** `server/routes/ipfs.ts`, `server/routes/storage.ts`
- **Fix:** Replaced with explicit `multer.diskStorage({ destination, filename })` configuration.

#### FIX-04 — server.ts: 404 handler left non-API routes with hanging connections
- **Problem:** The catch-all middleware only called `res.status(404).json(...)` for `/api/` routes. All other unmatched routes received no response, causing client connections to hang indefinitely.
- **File:** `server.ts`
- **Fix:** Added `else` branch to send `404 Not Found` for all other unmatched routes.

### 🟠 High-Priority Fixes

#### FIX-05 — Missing React Error Boundaries (app crash on any page error)
- **Problem:** No `ErrorBoundary` existed anywhere in the component tree. Any unhandled runtime error in any page component caused the entire SPA to render a blank screen with no recovery path.
- **Files:** `src/components/ErrorBoundary.tsx` (new), `src/App.tsx`
- **Fix:** Created full `ErrorBoundary` class component with reset + home buttons and inline mode. Wrapped every route in `<ErrorBoundary>` + `<Suspense>`. Added 404 catch-all route.

#### FIX-06 — NotificationType missing 'warning' variant
- **Problem:** `useWallet.ts` calls `addNotification({ type: 'warning', ... })` but `NotificationType` only included `'success' | 'error' | 'info' | 'loading'`. This is a TypeScript compile error. The `Notifications.tsx` component also had no styling or icon for `warning`.
- **Files:** `src/types.ts`, `src/components/Notifications.tsx`
- **Fix:** Added `'warning'` to `NotificationType` union. Added yellow background, border, and `AlertTriangle` icon for warning notifications.

#### FIX-07 — Docker: deprecated `--loader tsx/esm` Node.js flag
- **Problem:** `node --loader tsx/esm` is deprecated since Node 20 and removed in Node 22+. The analytics-indexer and cronos-listener services in docker-compose used this flag and would fail on modern Node versions.
- **Files:** `infra/docker/docker-compose.yml`, `infra/docker/Dockerfile`
- **Fix:** Replaced `--loader` with `--import` throughout.

#### FIX-08 — ContractBuilder and DeployWizard rendered on Solana network
- **Problem:** Both pages are Solana-unaware EVM-only tools. When the user switches to Solana network, they see EVM-specific Solidity contract UI with no guidance, creating confusion.
- **Files:** `src/pages/ContractBuilder.tsx`, `src/pages/DeployWizard.tsx`
- **Fix:** Added `isSolanaNetwork()` guard at the top of each component. On Solana, renders a clear redirect card pointing users to the Minting page (Metaplex).

### 🟡 Medium-Priority Fixes

#### FIX-09 — OwnerMint.tsx: double-notification bug
- **Problem:** After sending the mint transaction, the component called `addNotification(...)` to show "Mining…" status instead of `updateNotification(notifId, ...)`, creating two overlapping loading toasts.
- **File:** `src/components/minting/OwnerMint.tsx`
- **Fix:** Changed to `updateNotification(notifId, { type: 'loading', title: 'Mining…', ... })`. Added `updateNotification` to the store destructuring.

#### FIX-10 — MintingDashboard.tsx: empty catch block swallowed network errors
- **Problem:** `handleSwitchNetwork` had an empty `catch (error) {}` block. Any MetaMask error (rejected, wrong chain) was silently discarded with no feedback to the user.
- **File:** `src/pages/MintingDashboard.tsx`
- **Fix:** Added `console.warn(...)` to log the error for debugging.

#### FIX-11 — NFTGallery.tsx: hardcoded IPFS gateway
- **Problem:** The IPFS gateway was hardcoded to `https://gateway.lighthouse.storage/ipfs/`. Users who configured Pinata or Infura in Settings had their images still load from Lighthouse (or fail if CIDs were pinned elsewhere).
- **File:** `src/pages/NFTGallery.tsx`
- **Fix:** `resolveIPFS()` now accepts an optional `gateway` parameter with the Lighthouse URL as fallback.

#### FIX-12 — server.ts: health check registered after static middleware
- **Problem:** In production mode, `express.static(dist/)` was registered before the `/api/health` route. If a `dist/api/` directory existed it could intercept the health check.
- **File:** `server.ts`
- **Fix:** Added comment clarifying health check must be before static middleware. Refactored registration order. Added `uptime` field to health response.

#### FIX-13 — server.ts: no graceful shutdown handlers
- **Problem:** The process had no `SIGTERM`/`SIGINT` handlers or `unhandledRejection` handler. On Kubernetes/Railway/Render, `SIGTERM` is sent before pod termination — without a handler the process exits immediately, dropping in-flight requests.
- **File:** `server.ts`
- **Fix:** Added `process.on('SIGTERM')`, `process.on('SIGINT')`, and `process.on('unhandledRejection')` handlers.

### 🟢 Quality / DX Improvements

#### FIX-14 — index.html: missing meta tags + FOUC
- **Problem:** Missing `description`, OG tags, `theme-color`. No FOUC (Flash of Unstyled Content) prevention — the page flashed white before React mounted and applied the dark theme.
- **File:** `index.html`
- **Fix:** Added complete meta tags. Added inline `<script>` that applies `--bg-base` from localStorage before React mounts, eliminating the white flash.

#### FIX-15 — New: LoadingSpinner shared component
- **File:** `src/components/LoadingSpinner.tsx` (new)
- **Purpose:** Reusable `<Spinner>` and `<PageLoading>` components for consistent loading states across all pages.

#### FIX-16 — New: .gitignore was completely missing
- **File:** `.gitignore` (new)
- **Fix:** Added comprehensive gitignore covering node_modules, dist, .env files, db.json, uploads/, logs, editor files, OS files, Prisma generated client, TypeScript cache.

#### FIX-17 — package.json: missing scripts and no Node engine requirement
- **File:** `package.json`
- **Fix:** Added `type-check`, `type-check:server`, `db:reset`, `db:seed` scripts. Added `engines: { node: ">=18.0.0", npm: ">=9.0.0" }`.

---

## What Was NOT Changed

The following working systems were audited and found correct — no changes made:

- All Zustand store actions and state shape
- All 12 Express route files (beyond multer fix)  
- Solana pages (SolanaSwap, SolanaMinting, SolanaTokenBuilder, SolanaLiquidity, SolanaAnalytics)
- IPFS encryption utilities (proper AES-256-CBC with random IV)
- RPC proxy rotation logic (both Cronos and Solana)
- Sidebar network-aware navigation
- Header wallet connection and balance display
- Theme system (CSS variables + 7 presets)
- AI Assistant (Puter API integration)
- Wallet modal (EVM + Solana tabs)
- Token selector modal
- Contract generator (Solidity source generation)
- Merkle tree implementation
- All analytics, minting, and token builder page logic

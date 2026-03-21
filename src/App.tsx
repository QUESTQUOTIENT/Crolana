import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAppStore } from './store';
import { isSolanaNetwork } from './types';

// ── Lazy-loaded EVM (Cronos) pages ────────────────────────────────────────────
// Each page becomes its own chunk — only loaded when user navigates to it.
// This reduces the initial JS parse from ~3.8 MB to ~300 KB, fixing mobile blank page.
const Dashboard         = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const AssetCreation     = lazy(() => import('./pages/AssetCreation').then(m => ({ default: m.AssetCreation })));
const MetadataBuilder   = lazy(() => import('./pages/MetadataBuilder').then(m => ({ default: m.MetadataBuilder })));
const IpfsManager       = lazy(() => import('./pages/IpfsManager').then(m => ({ default: m.IpfsManager })));
const ContractBuilder   = lazy(() => import('./pages/ContractBuilder').then(m => ({ default: m.ContractBuilder })));
const DeployWizard      = lazy(() => import('./pages/DeployWizard').then(m => ({ default: m.DeployWizard })));
const MintingDashboard  = lazy(() => import('./pages/MintingDashboard').then(m => ({ default: m.MintingDashboard })));
const MarketplacePrep   = lazy(() => import('./pages/MarketplacePrep').then(m => ({ default: m.MarketplacePrep })));
const Analytics         = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const Settings          = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const About             = lazy(() => import('./pages/About').then(m => ({ default: m.About })));
const TokenBuilderPage  = lazy(() => import('./pages/TokenBuilderPage').then(m => ({ default: m.TokenBuilderPage })));
const SwapPage          = lazy(() => import('./pages/SwapPage').then(m => ({ default: m.SwapPage })));
const LiquidityManager  = lazy(() => import('./pages/LiquidityManager').then(m => ({ default: m.LiquidityManager })));
const Launchpad         = lazy(() => import('./pages/Launchpad').then(m => ({ default: m.Launchpad })));
const NFTGallery        = lazy(() => import('./pages/NFTGallery').then(m => ({ default: m.NFTGallery })));

// ── Lazy-loaded Solana pages ──────────────────────────────────────────────────
const SolanaLiquidity    = lazy(() => import('./pages/SolanaLiquidity').then(m => ({ default: m.SolanaLiquidity })));
const SolanaTokenBuilder = lazy(() => import('./pages/SolanaTokenBuilder').then(m => ({ default: m.SolanaTokenBuilder })));
const SolanaAnalytics    = lazy(() => import('./pages/SolanaAnalytics').then(m => ({ default: m.SolanaAnalytics })));
const SolanaMinting      = lazy(() => import('./pages/SolanaMinting').then(m => ({ default: m.SolanaMinting })));

// ── Page loading spinner ──────────────────────────────────────────────────────
function PageSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '2px solid rgba(59,130,246,0.3)',
          borderTopColor: '#3b82f6',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontSize: 13, color: '#64748b' }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Chunk-load error boundary ─────────────────────────────────────────────────
// Catches dynamic import failures (network timeout on slow mobile) and shows
// a user-friendly reload prompt instead of a silent blank page.
class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(err: Error) {
    if (
      err?.message?.includes('Failed to fetch dynamically imported module') ||
      err?.message?.includes('error loading dynamically imported module') ||
      err?.message?.includes('Importing a module script failed') ||
      err?.name === 'ChunkLoadError'
    ) {
      return { failed: true };
    }
    return null;
  }

  render() {
    if (this.state.failed) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#020817', padding: '1.5rem',
        }}>
          <div style={{ textAlign: 'center', maxWidth: 380, color: '#94a3b8', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📡</div>
            <h2 style={{ color: '#f1f5f9', marginBottom: '0.5rem', fontSize: '1.2rem' }}>
              Page failed to load
            </h2>
            <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              A resource could not be downloaded. This can happen on slow mobile connections.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#3b82f6', color: '#fff', border: 'none',
                borderRadius: 8, padding: '0.6rem 1.5rem', fontSize: '0.9rem', cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * NetworkRoute
 * Renders the Solana component when the active network is Solana,
 * otherwise the EVM component.
 */
function NetworkRoute({
  evm: Evm,
  sol: Sol,
}: {
  evm: React.ComponentType;
  sol: React.ComponentType;
}) {
  const { network } = useAppStore();
  return isSolanaNetwork(network) ? <Sol /> : <Evm />;
}

/**
 * PageWrapper — per-route ErrorBoundary + Suspense so a single page crash
 * never takes down the sidebar/header.
 */
function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary inline={false}>
      <Suspense fallback={<PageSpinner />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ChunkErrorBoundary>
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<PageWrapper><Dashboard /></PageWrapper>} />
              <Route path="assets"      element={<PageWrapper><AssetCreation /></PageWrapper>} />
              <Route path="metadata"    element={<PageWrapper><MetadataBuilder /></PageWrapper>} />
              <Route path="ipfs"        element={<PageWrapper><IpfsManager /></PageWrapper>} />
              <Route path="contract"    element={<PageWrapper><ContractBuilder /></PageWrapper>} />
              <Route path="deploy"      element={<PageWrapper><DeployWizard /></PageWrapper>} />
              <Route path="minting"     element={<PageWrapper><NetworkRoute evm={MintingDashboard} sol={SolanaMinting} /></PageWrapper>} />
              <Route path="gallery"     element={<PageWrapper><NFTGallery /></PageWrapper>} />
              <Route path="marketplace" element={<PageWrapper><MarketplacePrep /></PageWrapper>} />
              <Route path="analytics"   element={<PageWrapper><NetworkRoute evm={Analytics} sol={SolanaAnalytics} /></PageWrapper>} />
              <Route path="launchpad"   element={<PageWrapper><Launchpad /></PageWrapper>} />
              <Route path="swap"        element={<PageWrapper><SwapPage /></PageWrapper>} />
              <Route path="liquidity"   element={<PageWrapper><NetworkRoute evm={LiquidityManager} sol={SolanaLiquidity} /></PageWrapper>} />
              <Route path="token"       element={<PageWrapper><NetworkRoute evm={TokenBuilderPage} sol={SolanaTokenBuilder} /></PageWrapper>} />
              <Route path="settings"    element={<PageWrapper><Settings /></PageWrapper>} />
              <Route path="about"       element={<PageWrapper><About /></PageWrapper>} />
              <Route path="*" element={
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 256, gap: 16 }}>
                  <p style={{ fontSize: '3.75rem', fontWeight: 900, color: '#1e293b' }}>404</p>
                  <p style={{ color: '#94a3b8' }}>Page not found</p>
                  <a href="/" style={{ padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
                    Back to Dashboard
                  </a>
                </div>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ChunkErrorBoundary>
  );
}

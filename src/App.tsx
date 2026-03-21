import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';

// ── EVM (Cronos) pages ────────────────────────────────────────────────────────
import { Dashboard }         from './pages/Dashboard';
import { AssetCreation }     from './pages/AssetCreation';
import { MetadataBuilder }   from './pages/MetadataBuilder';
import { IpfsManager }       from './pages/IpfsManager';
import { ContractBuilder }   from './pages/ContractBuilder';
import { DeployWizard }      from './pages/DeployWizard';
import { MintingDashboard }  from './pages/MintingDashboard';
import { MarketplacePrep }   from './pages/MarketplacePrep';
import { Analytics }         from './pages/Analytics';
import { Settings }          from './pages/Settings';
import { About }             from './pages/About';
import { TokenBuilderPage }  from './pages/TokenBuilderPage';
import { SwapPage }          from './pages/SwapPage';
import { LiquidityManager }  from './pages/LiquidityManager';
import { Launchpad }         from './pages/Launchpad';
import { NFTGallery }        from './pages/NFTGallery';

// ── Solana pages ─────────────────────────────────────────────────────────────
import { SolanaLiquidity }    from './pages/SolanaLiquidity';
import { SolanaTokenBuilder } from './pages/SolanaTokenBuilder';
import { SolanaAnalytics }    from './pages/SolanaAnalytics';
import { SolanaMinting }      from './pages/SolanaMinting';

// ── Network selector ──────────────────────────────────────────────────────────
import { useAppStore }     from './store';
import { isSolanaNetwork } from './types';

/**
 * NetworkRoute
 * Renders the Solana component when the active network is Solana,
 * otherwise the EVM component. Same URL — no navigation change required.
 */
function NetworkRoute({ evm: Evm, sol: Sol }: { evm: React.ComponentType; sol: React.ComponentType }) {
  const { network } = useAppStore();
  return isSolanaNetwork(network) ? <Sol /> : <Evm />;
}

/**
 * PageWrapper — wraps each route in its own ErrorBoundary so a single page
 * crash doesn't take down the whole app (sidebar + header stay functional).
 */
function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary inline={false}>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-64">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      }>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    // Top-level ErrorBoundary catches anything that slips past route boundaries
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* ── NFT Workflow ── */}
            <Route index        element={<PageWrapper><Dashboard /></PageWrapper>} />
            <Route path="assets"      element={<PageWrapper><AssetCreation /></PageWrapper>} />
            <Route path="metadata"    element={<PageWrapper><MetadataBuilder /></PageWrapper>} />
            <Route path="ipfs"        element={<PageWrapper><IpfsManager /></PageWrapper>} />

            {/* Contract Builder: EVM = Solidity; Solana = redirects to Minting */}
            <Route path="contract"    element={<PageWrapper><ContractBuilder /></PageWrapper>} />
            <Route path="deploy"      element={<PageWrapper><DeployWizard /></PageWrapper>} />

            {/* Minting: EVM = MintingDashboard; Solana = SolanaMinting (Metaplex) */}
            <Route path="minting"     element={<PageWrapper><NetworkRoute evm={MintingDashboard} sol={SolanaMinting} /></PageWrapper>} />

            <Route path="gallery"     element={<PageWrapper><NFTGallery /></PageWrapper>} />
            <Route path="marketplace" element={<PageWrapper><MarketplacePrep /></PageWrapper>} />

            {/* Analytics: EVM = on-chain Transfer events; Solana = SPL/NFT analytics */}
            <Route path="analytics"   element={<PageWrapper><NetworkRoute evm={Analytics} sol={SolanaAnalytics} /></PageWrapper>} />

            <Route path="launchpad"   element={<PageWrapper><Launchpad /></PageWrapper>} />

            {/* ── DeFi Tools — fully network-aware ── */}
            <Route path="swap"        element={<PageWrapper><SwapPage /></PageWrapper>} />

            {/* Liquidity: EVM = VVS Finance; Solana = Raydium */}
            <Route path="liquidity"   element={<PageWrapper><NetworkRoute evm={LiquidityManager} sol={SolanaLiquidity} /></PageWrapper>} />

            {/* Token Builder: EVM = ERC-20; Solana = SPL token */}
            <Route path="token"       element={<PageWrapper><NetworkRoute evm={TokenBuilderPage} sol={SolanaTokenBuilder} /></PageWrapper>} />

            {/* ── System ── */}
            <Route path="settings"    element={<PageWrapper><Settings /></PageWrapper>} />
            <Route path="about"       element={<PageWrapper><About /></PageWrapper>} />

            {/* ── 404 catch-all ── */}
            <Route path="*" element={
              <div className="flex flex-col items-center justify-center min-h-64 gap-4">
                <p className="text-6xl font-black text-slate-800">404</p>
                <p className="text-slate-400">Page not found</p>
                <a href="/" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                  Back to Dashboard
                </a>
              </div>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

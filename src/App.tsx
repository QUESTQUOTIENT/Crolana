import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackButtonHandler } from './components/BackButtonHandler';




const Dashboard        = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const AssetCreation    = React.lazy(() => import('./pages/AssetCreation').then(m => ({ default: m.AssetCreation })));
const MetadataBuilder  = React.lazy(() => import('./pages/MetadataBuilder').then(m => ({ default: m.MetadataBuilder })));
const IpfsManager      = React.lazy(() => import('./pages/IpfsManager').then(m => ({ default: m.IpfsManager })));
const ContractBuilder  = React.lazy(() => import('./pages/ContractBuilder').then(m => ({ default: m.ContractBuilder })));
const DeployWizard     = React.lazy(() => import('./pages/DeployWizard').then(m => ({ default: m.DeployWizard })));
const MintingDashboard = React.lazy(() => import('./pages/MintingDashboard').then(m => ({ default: m.MintingDashboard })));
const NFTGallery       = React.lazy(() => import('./pages/NFTGallery').then(m => ({ default: m.NFTGallery })));
const MarketplacePrep  = React.lazy(() => import('./pages/MarketplacePrep').then(m => ({ default: m.MarketplacePrep })));
const Analytics        = React.lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const Settings         = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const About            = React.lazy(() => import('./pages/About').then(m => ({ default: m.About })));
const TokenBuilderPage = React.lazy(() => import('./pages/TokenBuilderPage').then(m => ({ default: m.TokenBuilderPage })));
const SwapPage         = React.lazy(() => import('./pages/SwapPage').then(m => ({ default: m.SwapPage })));
const LiquidityManager = React.lazy(() => import('./pages/LiquidityManager').then(m => ({ default: m.LiquidityManager })));
const Launchpad        = React.lazy(() => import('./pages/Launchpad').then(m => ({ default: m.Launchpad })));



const SolanaLiquidity    = React.lazy(() => import('./pages/SolanaLiquidity').then(m => ({ default: m.SolanaLiquidity })));
const SolanaTokenBuilder = React.lazy(() => import('./pages/SolanaTokenBuilder').then(m => ({ default: m.SolanaTokenBuilder })));
const SolanaAnalytics    = React.lazy(() => import('./pages/SolanaAnalytics').then(m => ({ default: m.SolanaAnalytics })));
const SolanaMinting      = React.lazy(() => import('./pages/SolanaMinting').then(m => ({ default: m.SolanaMinting })));
const PublicMint         = React.lazy(() => import('./pages/PublicMint').then(m => ({ default: m.PublicMint })));


import { useAppStore }     from './store';
import { isSolanaNetwork } from './types';

function NetworkRoute({ evm: Evm, sol: Sol }: { evm: React.ComponentType; sol: React.ComponentType }) {
  const { network } = useAppStore();
  return isSolanaNetwork(network) ? <Sol /> : <Evm />;
}

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
    <ErrorBoundary>
      <BrowserRouter>
        <BackButtonHandler />
        <Routes>
          {}
          <Route path="/mint" element={
            <PageWrapper><PublicMint /></PageWrapper>
          } />
          <Route path="/" element={<Layout />}>
            <Route index             element={<PageWrapper><Dashboard /></PageWrapper>} />
            <Route path="assets"     element={<PageWrapper><AssetCreation /></PageWrapper>} />
            <Route path="metadata"   element={<PageWrapper><MetadataBuilder /></PageWrapper>} />
            <Route path="ipfs"       element={<PageWrapper><IpfsManager /></PageWrapper>} />
            <Route path="contract"   element={<PageWrapper><ContractBuilder /></PageWrapper>} />
            <Route path="deploy"     element={<PageWrapper><DeployWizard /></PageWrapper>} />
            <Route path="minting"    element={<PageWrapper><NetworkRoute evm={MintingDashboard} sol={SolanaMinting} /></PageWrapper>} />
            <Route path="gallery"    element={<PageWrapper><NFTGallery /></PageWrapper>} />
            <Route path="marketplace" element={<PageWrapper><MarketplacePrep /></PageWrapper>} />
            <Route path="analytics"  element={<PageWrapper><NetworkRoute evm={Analytics} sol={SolanaAnalytics} /></PageWrapper>} />
            <Route path="launchpad"  element={<PageWrapper><Launchpad /></PageWrapper>} />
            <Route path="swap"       element={<PageWrapper><SwapPage /></PageWrapper>} />
            <Route path="liquidity"  element={<PageWrapper><NetworkRoute evm={LiquidityManager} sol={SolanaLiquidity} /></PageWrapper>} />
            <Route path="token"      element={<PageWrapper><NetworkRoute evm={TokenBuilderPage} sol={SolanaTokenBuilder} /></PageWrapper>} />
            <Route path="settings"   element={<PageWrapper><Settings /></PageWrapper>} />
            <Route path="about"      element={<PageWrapper><About /></PageWrapper>} />
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

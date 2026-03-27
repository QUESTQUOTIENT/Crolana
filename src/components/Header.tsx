/**
 * src/components/Header.tsx
 *
 * Top navigation: network selector (Cronos Mainnet, Cronos Testnet,
 * Solana Mainnet, Solana Devnet) + wallet panel.
 *
 * EVM networks  → MetaMask button, ERC-20 token balances
 * Solana networks → Phantom button, SPL token balances
 */

import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { getReadProvider } from '../lib/provider';
import { getSolBalance, formatSol, disconnectPhantom } from '../lib/solana';
import {
  Wallet, ChevronDown, Network, LogOut, Copy, ExternalLink,
  CheckCircle, RefreshCw, Loader2, Zap, Menu,
} from 'lucide-react';
import { useAppStore } from '../store';
import { CRONOS_MAINNET, CRONOS_TESTNET, SOLANA_MAINNET, SOLANA_DEVNET, isSolanaNetwork } from '../types';
import { cn } from '../lib/utils';
import { WalletModal } from './WalletModal';
import { useWalletTokens } from '../hooks/useWalletTokens';
import { useSolanaTokens } from '../hooks/useSolanaTokens';
import { getTokenList } from '../data/tokens';
import { getSolTokenList } from '../data/solanaTokens';
import { useUnifiedWallet } from '../hooks/useUnifiedWallet';
import { parseChainError } from '../lib/chainErrors';

const ALL_NETWORKS = [CRONOS_MAINNET, CRONOS_TESTNET, SOLANA_MAINNET, SOLANA_DEVNET];

export function Header() {
  const {
    walletAddress, setWalletAddress,
    solanaWalletAddress, setSolanaWalletAddress,
    network, setNetwork, addNotification,
  } = useAppStore();

  // useUnifiedWallet manages session state — we sync back to Zustand so the
  // rest of the app (which reads from store) stays up to date (Gap wiring).
  const unified = useUnifiedWallet();

  // Keep Zustand store in sync whenever unified hook changes
  useEffect(() => {
    const evmAddr = unified.evmWallet?.address ?? null;
    if (evmAddr !== walletAddress) setWalletAddress(evmAddr);
  }, [unified.evmWallet?.address]);

  useEffect(() => {
    const solAddr = unified.solanaWallet?.address ?? null;
    if (solAddr !== solanaWalletAddress) setSolanaWalletAddress(solAddr);
  }, [unified.solanaWallet?.address]);

  const isSolana = isSolanaNetwork(network);
  const activeWallet = isSolana ? solanaWalletAddress : walletAddress;

  const [isNetworkOpen, setIsNetworkOpen]   = useState(false);
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [nativeBalance, setNativeBalance]   = useState<string | null>(null);

  const walletMenuRef  = useRef<HTMLDivElement>(null);
  const networkMenuRef = useRef<HTMLDivElement>(null);

  // ── EVM token balances (only when wallet menu open on EVM) ────────────────
  const { balances: evmBalances, isLoading: evmLoading, refresh: evmRefresh } =
    useWalletTokens((!isSolana && isWalletMenuOpen) ? walletAddress : null, network.chainId);

  // ── Solana SPL balances (only when wallet menu open on Solana) ────────────
  const { balances: solBalances, isLoading: solLoading, refresh: solRefresh } =
    useSolanaTokens((isSolana && isWalletMenuOpen) ? solanaWalletAddress : null, network.cluster ?? 'mainnet-beta');

  const balances     = isSolana ? solBalances : evmBalances;
  const balancesLoading = isSolana ? solLoading : evmLoading;
  const refreshBalances = isSolana ? solRefresh : evmRefresh;

  const evmTokens = getTokenList(network.chainId);
  const solTokens = getSolTokenList(network.cluster ?? 'mainnet-beta');
  const tokens    = isSolana ? solTokens : evmTokens;

  // ── Native balance fetch ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setNativeBalance(null);

    const fetchBalance = async (retries = 3) => {
      if (!activeWallet) return;
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          if (isSolana) {
            const lamports = await getSolBalance(activeWallet, network.cluster ?? 'mainnet-beta');
            if (!cancelled) setNativeBalance(formatSol(lamports, 3));
          } else {
            const provider = getReadProvider(network.chainId);
            const bal = await provider.getBalance(activeWallet);
            if (!cancelled) setNativeBalance(parseFloat(ethers.formatEther(bal)).toFixed(3));
          }
          return;
        } catch {
          if (attempt < retries - 1) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    };

    fetchBalance();
    const interval = activeWallet ? setInterval(() => fetchBalance(2), isSolana ? 20_000 : 15_000) : null;
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [activeWallet, network, isSolana]);

  // ── Click-outside close ───────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node))  setIsWalletMenuOpen(false);
      if (networkMenuRef.current && !networkMenuRef.current.contains(e.target as Node)) setIsNetworkOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── MetaMask event listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return;
    const onAcc = (acc: string[]) => { setWalletAddress(acc[0] || ''); setNativeBalance(null); };
    const onChain = () => window.location.reload();
    window.ethereum.on('accountsChanged', onAcc);
    window.ethereum.on('chainChanged', onChain);
    return () => { window.ethereum.removeListener('accountsChanged', onAcc); window.ethereum.removeListener('chainChanged', onChain); };
  }, []);

  // ── Phantom event listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!window.solana) return;
    const onDisconnect = () => { setSolanaWalletAddress(null); setNativeBalance(null); };
    const onConnect = (pubkey: any) => { if (pubkey) setSolanaWalletAddress(pubkey.toString()); };
    window.solana.on('disconnect', onDisconnect);
    window.solana.on('connect', onConnect);
    return () => { try { window.solana!.off('disconnect', onDisconnect); window.solana!.off('connect', onConnect); } catch {} };
  }, []);

  const disconnect = async () => {
    try {
      if (isSolana) {
        await unified.disconnectSolana();
      } else {
        unified.disconnectEVM();
      }
    } catch (err: any) {
      const parsed = parseChainError(err, isSolana ? 'solana' : 'cronos');
      console.warn('[Header] disconnect error:', parsed.message);
    }
    setNativeBalance(null);
    setIsWalletMenuOpen(false);
    addNotification({ type: 'info', title: 'Wallet Disconnected', message: '', duration: 2000 });
  };

  const copyAddress = () => {
    if (!activeWallet) return;
    navigator.clipboard.writeText(activeWallet);
    addNotification({ type: 'success', title: 'Address Copied', message: activeWallet, duration: 2000 });
    setIsWalletMenuOpen(false);
  };

  const switchNetwork = async (target: typeof CRONOS_MAINNET) => {
    setNetwork(target);
    setIsNetworkOpen(false);
    setNativeBalance(null);
    // Only switch MetaMask for EVM networks
    if (!isSolanaNetwork(target) && walletAddress && window.ethereum) {
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${target.chainId.toString(16)}` }] });
      } catch (err: any) {
        if (err.code === 4902 || err.code === -32603) {
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
            chainId: `0x${target.chainId.toString(16)}`,
            chainName: target.name, rpcUrls: [target.rpcUrl],
            nativeCurrency: { name: target.symbol, symbol: target.symbol, decimals: 18 },
            blockExplorerUrls: [target.explorerUrl],
          }]});
        }
      }
    }
  };

  const shortAddr = activeWallet ? `${activeWallet.slice(0, 6)}…${activeWallet.slice(-4)}` : '';

  const netColor = (net: typeof CRONOS_MAINNET) => {
    if (isSolanaNetwork(net)) return net.isTestnet ? 'bg-orange-500' : 'bg-purple-500';
    return net.isTestnet ? 'bg-yellow-500' : 'bg-green-500';
  };
  const activeDot = netColor(network);

  // Build asset rows
  const assetRows = tokens.map(token => {
    const key = (isSolana ? (token as any).mint : (token as any).address)?.toLowerCase() ?? '';
    const entry = balances.get(key);
    return { token, balance: entry?.formattedBalance ?? '—', hasBalance: (entry?.rawBalance ?? 0n) > 0n };
  }).sort((a, b) => (a.hasBalance === b.hasBalance ? 0 : a.hasBalance ? -1 : 1));

  const explorerAddress = isSolana
    ? `${network.explorerUrl}/address/${activeWallet}`
    : `${network.explorerUrl}/address/${activeWallet}`;

  return (
    <>
      <header
        className="h-16 bg-slate-900/95 backdrop-blur border-b border-slate-800 flex items-center justify-between px-3 sm:px-6 fixed top-0 right-0 z-50"
        style={{ left: 'var(--sidebar-width, 16rem)', transition: 'left 0.3s' }}
      >
        <div className="flex items-center gap-3">
          {/* Mobile hamburger — only visible when sidebar is hidden (mobile) */}
          <button
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            onClick={() => {
              // Dispatch a custom event the Sidebar listens to
              window.dispatchEvent(new CustomEvent('toggle-sidebar'));
            }}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className={`w-2 h-2 rounded-full ${activeDot}`} />
          <span className="text-slate-300 text-sm font-medium">{network.name}</span>
          {isSolana
            ? <span className="text-slate-600 text-xs">{network.cluster}</span>
            : <span className="text-slate-600 text-xs">ID: {network.chainId}</span>}
          {isSolana && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/15 border border-purple-500/25 text-purple-400 text-[9px] font-bold rounded uppercase tracking-wider">
              <Zap className="w-2.5 h-2.5" /> Solana
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">

          {/* Network Selector */}
          <div className="relative" ref={networkMenuRef}>
            <button onClick={() => setIsNetworkOpen(!isNetworkOpen)}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors text-sm font-medium border border-slate-700">
              <div className={`w-2 h-2 rounded-full ${activeDot}`} />
              <Network className="w-3.5 h-3.5" />
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isNetworkOpen ? 'rotate-180' : ''}`} />
            </button>
            {isNetworkOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 py-1.5 z-50">
                <p className="text-[10px] text-slate-500 uppercase font-semibold px-3 py-1.5">Cronos (EVM)</p>
                {[CRONOS_MAINNET, CRONOS_TESTNET].map(net => (
                  <button key={net.chainId} onClick={() => switchNetwork(net)}
                    className={cn('w-full text-left px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors flex items-center gap-3',
                      network.chainId === net.chainId && !isSolana ? 'text-white' : 'text-slate-400')}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${net.isTestnet ? 'bg-yellow-500' : 'bg-green-500'}`} />
                    <div className="flex-1">
                      <p className="font-medium">{net.name}</p>
                      <p className="text-[10px] text-slate-500">Chain ID: {net.chainId}</p>
                    </div>
                    {network.chainId === net.chainId && !isSolana && <CheckCircle className="w-3.5 h-3.5 text-blue-400 ml-auto" />}
                  </button>
                ))}
                <div className="border-t border-slate-700/60 mt-1 pt-1">
                  <p className="text-[10px] text-purple-400/70 uppercase font-semibold px-3 py-1.5">Solana</p>
                  {[SOLANA_MAINNET, SOLANA_DEVNET].map(net => (
                    <button key={net.cluster} onClick={() => switchNetwork(net)}
                      className={cn('w-full text-left px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors flex items-center gap-3',
                        isSolana && network.cluster === net.cluster ? 'text-white' : 'text-slate-400')}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${net.isTestnet ? 'bg-orange-500' : 'bg-purple-500'}`} />
                      <div className="flex-1">
                        <p className="font-medium">{net.name}</p>
                        <p className="text-[10px] text-slate-500">{net.cluster}</p>
                      </div>
                      {isSolana && network.cluster === net.cluster && <CheckCircle className="w-3.5 h-3.5 text-purple-400 ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Wallet Button */}
          {activeWallet ? (
            <div className="relative" ref={walletMenuRef}>
              <button onClick={() => setIsWalletMenuOpen(!isWalletMenuOpen)}
                className={cn('flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                  isSolana
                    ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/30'
                    : 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/30')}>
                <div className={cn('w-2 h-2 rounded-full animate-pulse', isSolana ? 'bg-purple-400' : 'bg-green-400')} />
                <span className="font-mono">{shortAddr}</span>
                {nativeBalance ? (
                  <span className={cn('text-xs border-l pl-2', isSolana ? 'text-purple-300/70 border-purple-500/20' : 'text-green-300/70 border-green-500/20')}>
                    {nativeBalance} {network.symbol}
                  </span>
                ) : (
                  <span className={cn('text-xs border-l pl-2 animate-pulse', isSolana ? 'text-purple-300/30 border-purple-500/20' : 'text-green-300/30 border-green-500/20')}>
                    … {network.symbol}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isWalletMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isWalletMenuOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-slate-900 rounded-2xl shadow-2xl border border-slate-700/80 z-50 overflow-hidden">
                  <div className="px-4 py-4 border-b border-slate-800 bg-gradient-to-b from-slate-800/40 to-transparent">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Connected Wallet</p>
                          <span className={cn('px-1.5 py-0.5 text-[9px] font-bold rounded uppercase border',
                            isSolana ? 'bg-purple-500/15 border-purple-500/30 text-purple-400' : network.isTestnet ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' : 'bg-green-500/15 border-green-500/30 text-green-400')}>
                            {isSolana ? '◎ Solana' : network.isTestnet ? 'Testnet' : 'Mainnet'}
                          </span>
                        </div>
                        <p className="text-white font-mono text-[11px] break-all leading-relaxed">{activeWallet}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {nativeBalance ? (
                            <p className="text-slate-300 text-xs font-semibold">{nativeBalance} {network.symbol} <span className="text-slate-600 font-normal">native</span></p>
                          ) : (
                            <p className="text-slate-600 text-xs animate-pulse">Loading {network.symbol} balance…</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button onClick={copyAddress} title="Copy address" className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                        <a href={explorerAddress} target="_blank" rel="noreferrer" className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"><ExternalLink className="w-3.5 h-3.5" /></a>
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pt-3 pb-1">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Wallet Assets</p>
                      <button onClick={refreshBalances} disabled={balancesLoading} title="Refresh" className="p-1 text-slate-600 hover:text-slate-400 rounded transition-colors">
                        {balancesLoading ? <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> : <RefreshCw className="w-3 h-3" />}
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-0.5 rounded-xl overflow-hidden">
                      {assetRows.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-slate-600 text-xs gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading balances…
                        </div>
                      ) : assetRows.map(({ token, balance, hasBalance }) => {
                        const sym = isSolana ? (token as any).symbol : (token as any).symbol;
                        const name = isSolana ? (token as any).name : (token as any).name;
                        const isNative = !!(token as any).isNative;
                        return (
                          <div key={isSolana ? (token as any).mint : (token as any).address}
                            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                              hasBalance ? 'bg-slate-800/70 hover:bg-slate-800' : 'opacity-30 hover:opacity-55')}>
                            <div className={cn('w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white',
                              isNative ? (isSolana ? 'bg-gradient-to-br from-purple-500 to-pink-400' : 'bg-gradient-to-br from-blue-500 to-cyan-400') : 'bg-gradient-to-br from-slate-600 to-slate-700')}>
                              {sym.slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-semibold leading-none">{sym}</p>
                              <p className="text-slate-600 text-[10px] truncate leading-none mt-0.5">{name}</p>
                            </div>
                            <p className={cn('text-xs font-semibold tabular-nums flex-shrink-0', hasBalance ? 'text-white' : 'text-slate-700')}>
                              {balancesLoading && balance === '—' ? <span className="text-slate-700 text-[10px]">…</span> : balance}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="px-3 pb-3 pt-2 border-t border-slate-800 mt-2 flex gap-2">
                    <a href={explorerAddress} target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors">
                      <ExternalLink className="w-3 h-3" /> Explorer
                    </a>
                    <button onClick={disconnect}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-medium rounded-lg transition-colors border border-red-500/20">
                      <LogOut className="w-3 h-3" /> Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors shadow-lg shadow-blue-900/30">
              <Wallet className="w-4 h-4" /> Connect Wallet
            </button>
          )}
        </div>
      </header>
      <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
    </>
  );
}

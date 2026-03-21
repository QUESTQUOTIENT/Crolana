/**
 * src/components/TokenSelectorModal.tsx
 *
 * Shared token-selector modal used by SwapPage and LiquidityManager.
 *
 * Features:
 *  • Shows live wallet balance next to every token (fetched via proxy)
 *  • Sorts tokens: wallet tokens with balance first (desc), then rest
 *  • Highlights "Your tokens" section vs "All tokens"
 *  • Custom token import via contract address lookup
 *  • Animated, production-quality UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { X, Search, RefreshCw, CheckCircle, Loader2, Wallet } from 'lucide-react';
import { getReadProvider } from '../lib/provider';
import { ERC20_ABI, formatAmount, isNativeCRO } from '../lib/dex';
import { NATIVE_CRO_ADDRESS, type Token } from '../data/tokens';

interface TokenWithBalance extends Token {
  balance: string;
  rawBalance: bigint;
  hasBalance: boolean;
}

interface Props {
  tokens: Token[];
  onSelect: (token: Token) => void;
  onClose: () => void;
  selectedAddress: string;
  title: string;
  chainId: number;
  walletAddress?: string | null;
}

async function fetchTokenBalance(
  token: Token,
  walletAddress: string,
  chainId: number,
): Promise<bigint> {
  try {
    const provider = getReadProvider(chainId);
    if (token.isNative || token.address.toLowerCase() === NATIVE_CRO_ADDRESS.toLowerCase()) {
      return await provider.getBalance(walletAddress);
    }
    const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
    return await contract.balanceOf(walletAddress);
  } catch {
    return 0n;
  }
}

export function TokenSelectorModal({
  tokens,
  onSelect,
  onClose,
  selectedAddress,
  title,
  chainId,
  walletAddress,
}: Props) {
  const [search, setSearch] = useState('');
  const [tokensWithBal, setTokensWithBal] = useState<TokenWithBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importedToken, setImportedToken] = useState<Token | null>(null);
  const [importError, setImportError] = useState('');

  // Fetch all balances in parallel
  const loadBalances = useCallback(async () => {
    if (!walletAddress) {
      setTokensWithBal(
        tokens.map((t) => ({ ...t, balance: '0', rawBalance: 0n, hasBalance: false })),
      );
      return;
    }

    setLoadingBalances(true);
    try {
      const results = await Promise.allSettled(
        tokens.map((t) => fetchTokenBalance(t, walletAddress, chainId)),
      );

      const enriched: TokenWithBalance[] = tokens.map((token, i) => {
        const raw = results[i].status === 'fulfilled' ? results[i].value : 0n;
        return {
          ...token,
          rawBalance: raw,
          balance: raw > 0n ? formatAmount(raw, token.decimals, 6) : '0',
          hasBalance: raw > 0n,
        };
      });
      setTokensWithBal(enriched);
    } catch {
      setTokensWithBal(
        tokens.map((t) => ({ ...t, balance: '0', rawBalance: 0n, hasBalance: false })),
      );
    } finally {
      setLoadingBalances(false);
    }
  }, [tokens, walletAddress, chainId]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // Filter by search
  const filtered = tokensWithBal.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.address.toLowerCase().includes(search.toLowerCase()),
  );

  // Sort: tokens with balance first (desc), then by symbol
  const sorted = [...filtered].sort((a, b) => {
    if (a.hasBalance && !b.hasBalance) return -1;
    if (!a.hasBalance && b.hasBalance) return 1;
    if (a.hasBalance && b.hasBalance) {
      // Sort by raw balance descending
      if (b.rawBalance > a.rawBalance) return 1;
      if (a.rawBalance > b.rawBalance) return -1;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  const walletTokens = sorted.filter((t) => t.hasBalance);
  const otherTokens = sorted.filter((t) => !t.hasBalance);

  const isAddress = /^0x[0-9a-fA-F]{40}$/.test(search.trim());
  const inList = filtered.some(
    (t) => t.address.toLowerCase() === search.toLowerCase(),
  );

  const handleImportToken = async () => {
    setImportLoading(true);
    setImportError('');
    try {
      const res = await fetch(
        `/api/dex/token?address=${search.trim()}&chainId=${chainId}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Token not found');
      setImportedToken({
        address: data.address,
        symbol: data.symbol,
        name: data.name,
        decimals: data.decimals,
      });
    } catch (e: any) {
      setImportError(e.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleSelect = (token: Token) => {
    onSelect(token);
    onClose();
  };

  function TokenRow({ token }: { token: TokenWithBalance }) {
    const isSelected =
      token.address.toLowerCase() === selectedAddress.toLowerCase();
    return (
      <button
        onClick={() => handleSelect(token)}
        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/80 transition-all text-left group ${isSelected ? 'bg-blue-500/10' : ''}`}
      >
        {/* Token icon */}
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-lg ${
            token.isNative
              ? 'bg-gradient-to-br from-blue-500 to-cyan-400'
              : 'bg-gradient-to-br from-slate-600 to-slate-700'
          }`}
        >
          {token.symbol.slice(0, 2)}
        </div>

        {/* Token info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm leading-tight">
            {token.symbol}
          </p>
          <p className="text-slate-500 text-xs truncate leading-tight mt-0.5">
            {token.name}
          </p>
        </div>

        {/* Balance */}
        <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
          {token.hasBalance ? (
            <span className="text-white text-sm font-semibold tabular-nums">
              {token.balance}
            </span>
          ) : (
            <span className="text-slate-700 text-xs">—</span>
          )}
          {isSelected && (
            <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-[#0d1117] rounded-2xl border border-slate-700/80 shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
          <h3 className="font-bold text-white text-base">{title}</h3>
          <div className="flex items-center gap-2">
            {walletAddress && (
              <button
                onClick={loadBalances}
                disabled={loadingBalances}
                className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Refresh balances"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingBalances ? 'animate-spin text-blue-400' : ''}`}
                />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-800/50">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setImportedToken(null);
                setImportError('');
              }}
              placeholder="Search name, symbol or paste address…"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-blue-500/60 focus:bg-slate-900 outline-none transition-colors"
            />
          </div>

          {/* Custom token import */}
          {isAddress && !inList && (
            <div className="mt-2 p-3 bg-slate-900 rounded-xl border border-slate-700/60">
              {importedToken ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
                      {importedToken.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">
                        {importedToken.symbol}
                      </p>
                      <p className="text-slate-500 text-xs">{importedToken.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSelect(importedToken)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    Import
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">
                      Custom token address
                    </p>
                    {importError && (
                      <p className="text-red-400 text-xs mt-0.5">{importError}</p>
                    )}
                  </div>
                  <button
                    onClick={handleImportToken}
                    disabled={importLoading}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 flex-shrink-0 transition-colors"
                  >
                    {importLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      'Look up'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Token list */}
        <div className="overflow-y-auto flex-1 divide-y divide-slate-800/50">
          {loadingBalances && tokensWithBal.length === 0 ? (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading balances…
            </div>
          ) : (
            <>
              {/* Wallet tokens with balance */}
              {walletTokens.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-slate-900/60 flex items-center gap-1.5">
                    <Wallet className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Your tokens
                    </span>
                    {loadingBalances && (
                      <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-600 ml-1" />
                    )}
                  </div>
                  {walletTokens.map((t) => (
                    <TokenRow key={t.address} token={t} />
                  ))}
                </>
              )}

              {/* All other tokens */}
              {otherTokens.length > 0 && (
                <>
                  {walletTokens.length > 0 && (
                    <div className="px-4 py-2 bg-slate-900/40">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                        All tokens
                      </span>
                    </div>
                  )}
                  {otherTokens.map((t) => (
                    <TokenRow key={t.address} token={t} />
                  ))}
                </>
              )}

              {sorted.length === 0 && !isAddress && (
                <div className="px-4 py-10 text-center text-slate-500 text-sm">
                  No tokens match &ldquo;{search}&rdquo;
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hint */}
        {walletAddress && (
          <div className="px-4 py-2.5 border-t border-slate-800/50 bg-slate-900/40">
            <p className="text-[11px] text-slate-600 text-center">
              Balances fetched via Cronos RPC proxy
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

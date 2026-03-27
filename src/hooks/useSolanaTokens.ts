/**
 * src/hooks/useSolanaTokens.ts
 *
 * Fetches and caches native SOL + SPL token balances for a connected
 * Phantom wallet. Mirrors useWalletTokens.ts but uses Solana JSON-RPC
 * instead of ethers.js.
 *
 * - All RPC calls route through /api/solana/rpc[/devnet] server proxy
 * - Batches via Promise.allSettled for resilience
 * - Auto-refreshes every 30 s
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSolTokenList, NATIVE_SOL_MINT, type SolToken } from '../data/solanaTokens';
import { getSolBalance, getSplTokenAccounts, formatSol } from '../lib/solana';

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface SolTokenBalance {
  token: SolToken;
  rawBalance: bigint;   // lamports for SOL, raw units for SPL
  formattedBalance: string;
}

interface Result {
  balances: Map<string, SolTokenBalance>;  // keyed by mint address (lowercase)
  isLoading: boolean;
  refresh: () => void;
}

function formatSplAmount(amount: bigint, decimals: number): string {
  if (amount === 0n) return '0';
  const num = Number(amount) / 10 ** decimals;
  if (num < 0.000001) return '< 0.000001';
  return num.toFixed(6).replace(/\.?0+$/, '');
}

export function useSolanaTokens(
  walletAddress: string | null,
  cluster: string,
): Result {
  const [balances, setBalances] = useState<Map<string, SolTokenBalance>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!walletAddress) {
      setBalances(new Map());
      return;
    }

    setIsLoading(true);
    try {
      const tokens = getSolTokenList(cluster);
      const map = new Map<string, SolTokenBalance>();

      // Fetch native SOL balance
      try {
        const lamports = await getSolBalance(walletAddress, cluster);
        const raw = BigInt(lamports);
        const nativeToken = tokens.find(t => t.isNative)!;
        map.set(NATIVE_SOL_MINT.toLowerCase(), {
          token: nativeToken,
          rawBalance: raw,
          formattedBalance: formatSol(lamports, 4),
        });
      } catch { /* keep empty */ }

      // Fetch all SPL token accounts in one RPC call
      try {
        const splAccounts = await getSplTokenAccounts(walletAddress, cluster);
        for (const acc of splAccounts) {
          const known = tokens.find(t => t.mint.toLowerCase() === acc.mint.toLowerCase());
          if (!known) continue; // skip unknown tokens for now
          map.set(acc.mint.toLowerCase(), {
            token: known,
            rawBalance: BigInt(acc.amount),
            formattedBalance: formatSplAmount(BigInt(acc.amount), acc.decimals),
          });
        }
      } catch { /* keep empty */ }

      setBalances(map);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, cluster]);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

  return { balances, isLoading, refresh: fetchAll };
}

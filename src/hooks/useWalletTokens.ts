/**
 * src/hooks/useWalletTokens.ts
 *
 * Fetches and caches on-chain token balances for every token in the
 * active network's token list, plus native CRO.
 *
 * • Uses the server-side proxy provider (never MetaMask) for reads.
 * • Batches all balance calls with Promise.allSettled for resilience.
 * • Auto-refreshes every 30 s and on wallet/network change.
 * • Exposes a Map<address_lowercase, formattedBalanceString>.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { getReadProvider } from '../lib/provider';
import { getTokenList, NATIVE_CRO_ADDRESS, type Token } from '../data/tokens';
import { ERC20_ABI, formatAmount } from '../lib/dex';

export interface WalletTokenBalance {
  token: Token;
  rawBalance: bigint;
  formattedBalance: string;
  usdValue?: number; // future extension
}

interface UseWalletTokensResult {
  balances: Map<string, WalletTokenBalance>;
  isLoading: boolean;
  refresh: () => void;
}

const REFRESH_INTERVAL_MS = 30_000;

export function useWalletTokens(
  walletAddress: string | null,
  chainId: number,
): UseWalletTokensResult {
  const [balances, setBalances] = useState<Map<string, WalletTokenBalance>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!walletAddress) {
      setBalances(new Map());
      return;
    }

    setIsLoading(true);
    try {
      // getReadProvider uses WSS for testnet (drpc.org) for faster/more reliable balance fetching
      const provider = getReadProvider(chainId);
      const tokens = getTokenList(chainId);

      const results = await Promise.allSettled(
        tokens.map(async (token): Promise<[string, WalletTokenBalance]> => {
          let raw: bigint;

          if (token.isNative || token.address.toLowerCase() === NATIVE_CRO_ADDRESS.toLowerCase()) {
            raw = await provider.getBalance(walletAddress);
          } else {
            const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
            raw = await contract.balanceOf(walletAddress);
          }

          return [
            token.address.toLowerCase(),
            {
              token,
              rawBalance: raw,
              formattedBalance: formatAmount(raw, token.decimals, 6),
            },
          ];
        }),
      );

      const map = new Map<string, WalletTokenBalance>();
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [addr, data] = result.value;
          map.set(addr, data);
        }
      }
      setBalances(map);
    } catch {
      // silent — balances stay as previous values
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, chainId]);

  useEffect(() => {
    fetchAll();

    timerRef.current = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAll]);

  return { balances, isLoading, refresh: fetchAll };
}

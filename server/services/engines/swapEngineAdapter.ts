/**
 * server/services/engines/swapEngineAdapter.ts
 *
 * Server-side adapter connecting the dexController to packages/swap-engine.
 * The dexController uses this adapter for quote calculations and token lookups.
 * Actual swap execution happens on the frontend (requires wallet signer).
 */

import {
  getQuote,
  DEX_CONFIG,
  isNative,
  resolveAddress,
  type SwapQuote,
} from '../../../packages/swap-engine/index.js';
import { ethers } from 'ethers';

// RPC with fallback chain — same pattern as dexController
const MAINNET_RPCS = [
  process.env.CRONOS_MAINNET_RPC ?? 'https://evm.cronos.org',
  'https://cronos-evm-rpc.publicnode.com',
  'https://rpc.vvs.finance',
];
const TESTNET_RPCS = [process.env.CRONOS_TESTNET_RPC ?? 'https://evm-t3.cronos.org'];

async function getProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
  const rpcs = chainId === 25 ? MAINNET_RPCS : TESTNET_RPCS;
  for (const rpc of rpcs) {
    const provider = new ethers.JsonRpcProvider(rpc);
    try {
      await Promise.race([
        provider.getBlockNumber(),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 4000)),
      ]);
      return provider;
    } catch { /* try next */ }
  }
  throw new Error('All RPC endpoints unavailable');
}

export interface SwapQuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;   // Human-readable, e.g. "1.5"
  decimalsIn: number;
  chainId: number;
  slippageBps?: number;
}

export interface SwapQuoteResponse {
  amountOut: string;   // Human-readable
  amountOutMin: string;
  path: string[];
  priceImpact: number;
  dexName: string;
  routerAddress: string;
}

/**
 * Get a swap quote from the engine using a server-side RPC provider.
 * Returns human-readable amounts suitable for the frontend.
 */
export async function getServerSwapQuote(
  req: SwapQuoteRequest,
): Promise<SwapQuoteResponse | null> {
  const provider = await getProvider(req.chainId);
  const amountInBn = ethers.parseUnits(req.amountIn, req.decimalsIn);

  const quote = await getQuote(
    provider,
    req.chainId,
    req.tokenIn,
    req.tokenOut,
    amountInBn,
    req.slippageBps ?? 50,
  );

  if (!quote) return null;

  return {
    amountOut:    ethers.formatUnits(quote.amountOut, 18),   // Caller adjusts for output decimals
    amountOutMin: ethers.formatUnits(quote.minReceived, 18),
    path:         quote.path,
    priceImpact:  quote.priceImpact,
    dexName:      quote.dexName,
    routerAddress: quote.routerAddress,
  };
}

/**
 * Look up a token by address on-chain (symbol, name, decimals).
 */
const ERC20_META_ABI = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
];

export async function getTokenMetadata(
  address: string,
  chainId: number,
): Promise<{ address: string; symbol: string; name: string; decimals: number }> {
  const config = DEX_CONFIG[chainId as keyof typeof DEX_CONFIG] ?? DEX_CONFIG[25];

  if (isNative(address)) {
    return {
      address,
      symbol: chainId === 25 ? 'CRO' : 'TCRO',
      name:   chainId === 25 ? 'Cronos' : 'Test Cronos',
      decimals: 18,
    };
  }

  // Resolve address checksums
  let checksummed: string;
  try { checksummed = ethers.getAddress(address); }
  catch { throw new Error(`Invalid token address: ${address}`); }

  const provider = await getProvider(chainId);
  const contract = new ethers.Contract(checksummed, ERC20_META_ABI, provider);

  const [symbol, name, decimals] = await Promise.all([
    contract.symbol() as Promise<string>,
    contract.name()   as Promise<string>,
    contract.decimals() as Promise<bigint>,
  ]);

  return { address: checksummed, symbol, name, decimals: Number(decimals) };
}

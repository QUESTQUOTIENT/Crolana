/**
 * src/lib/rpc.ts
 *
 * Smart provider factory.
 *
 * WHY: The server-side RPC proxy (/api/rpc/25) can return 403 when public
 * Cronos nodes rate-limit server IPs. When MetaMask (or any injected wallet)
 * is present, using window.ethereum is always better:
 *   - No rate limits (wallet manages its own RPC connection)
 *   - No CORS issues
 *   - Faster (no server round-trip)
 *   - MetaMask handles network switching automatically
 *
 * CRITICAL: ethers JsonRpcProvider MUST receive an absolute URL.
 *   ✗ /api/rpc/25           → "unsupported protocol" error
 *   ✓ http://localhost:3000/api/rpc/25  → works
 *
 * staticNetwork: true → skips eth_chainId detection call on startup.
 * Eliminates "failed to detect network, retry in 1s" console spam.
 */

import { ethers } from 'ethers';

// ── Absolute proxy URL (required by ethers) ──────────────────────────────────
export function getRpcProxyUrl(chainId: number): string {
  const origin = typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:3000';
  return `${origin}/api/rpc/${chainId}`;
}

// ── Server-side proxy provider (absolute URL, no wallet needed) ───────────────
// Testnet: connect directly to drpc.org HTTP endpoint for speed + reliability
// Mainnet: always use server proxy (handles CORS, rotates nodes)
export function createProxyProvider(chainId: number): ethers.JsonRpcProvider {
  if (chainId === 338) {
    return new ethers.JsonRpcProvider(
      'https://cronos-testnet.drpc.org',
      { chainId: 338, name: 'cronos-testnet' },
      { staticNetwork: true },
    );
  }
  return new ethers.JsonRpcProvider(
    getRpcProxyUrl(chainId),
    { chainId, name: 'cronos' },
    { staticNetwork: true },
  );
}

/**
 * createRpcProvider / createStaticRpcProvider
 *
 * Primary provider for read-only calls (quotes, balances, totalSupply, etc).
 *
 * FIX (MetaMask -32603): We previously used BrowserProvider(window.ethereum)
 * whenever a wallet was detected. This routes every read call through MetaMask,
 * which forwards it to *whatever network MetaMask is currently on*. If the user
 * is on Ethereum mainnet, Cronos contract reads fail with:
 *   MetaMask RPC Error: Internal JSON-RPC error. {code: -32603}
 *
 * Correct strategy: always use the server-side proxy for read-only calls
 * so reads always reach the Cronos node — regardless of MetaMask's active chain.
 * BrowserProvider is only used for signing (getSigner).
 */
export function createRpcProvider(chainId: number): ethers.JsonRpcProvider {
  return createProxyProvider(chainId);
}

/** Alias for read-only / quote usage */
export function createStaticRpcProvider(chainId: number): ethers.JsonRpcProvider {
  return createProxyProvider(chainId);
}

/** Always returns a signer (requires wallet) */
export async function getSigner(): Promise<ethers.JsonRpcSigner> {
  if (!window?.ethereum) throw new Error('No wallet found. Please install MetaMask.');
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

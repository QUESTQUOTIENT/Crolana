/**
 * src/lib/provider.ts
 *
 * Provider factory for all read-only blockchain calls.
 *
 * ARCHITECTURE:
 *  - Mainnet (25):  always uses server-side proxy (/api/rpc/25)
 *                   → avoids CORS, rotates through reliable nodes
 *
 *  - Testnet (338): uses WebSocket directly via wss://cronos-testnet.drpc.org
 *                   → bypasses server proxy entirely, much lower latency
 *                   → falls back to HTTP proxy if WSS fails
 *
 * CRITICAL RULE (MetaMask -32603 fix):
 *   BrowserProvider(window.ethereum) is ONLY used for getSigner() / signing.
 *   ALL read-only calls (balances, quotes, reserves) use the providers below.
 *   This prevents MetaMask routing reads through whatever chain it's on.
 */

import { ethers } from 'ethers';

// drpc.org WebSocket endpoint for testnet — most reliable public WSS for Cronos testnet
const TESTNET_WSS = 'wss://cronos-testnet.drpc.org';
const TESTNET_HTTP = 'https://cronos-testnet.drpc.org';

// Cache WSS provider instance per session to avoid opening a new socket on every call
let _testnetWssProvider: ethers.WebSocketProvider | null = null;
let _testnetWssReady = false;

function getTestnetWssProvider(): ethers.WebSocketProvider | null {
  // Only attempt WebSocket in browser environment
  if (typeof window === 'undefined') return null;
  if (_testnetWssProvider && _testnetWssReady) return _testnetWssProvider;

  try {
    const p = new ethers.WebSocketProvider(
      TESTNET_WSS,
      { chainId: 338, name: 'cronos-testnet' },
    );
    // Mark ready once first response comes back; tear down on error
    p.on('network', () => { _testnetWssReady = true; });
    p.websocket.onerror = () => {
      _testnetWssReady = false;
      _testnetWssProvider = null;
    };
    p.websocket.onclose = () => {
      _testnetWssReady = false;
      _testnetWssProvider = null;
    };
    _testnetWssProvider = p;
    _testnetWssReady = true; // optimistically mark ready; onerror clears it
    return p;
  } catch {
    return null;
  }
}

/**
 * HTTP JSON-RPC proxy provider — routes through /api/rpc/:chainId on our server.
 * Server rotates through multiple RPC endpoints with fallback.
 */
export function getProxyProvider(chainId: number): ethers.JsonRpcProvider {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return new ethers.JsonRpcProvider(
    `${origin}/api/rpc/${chainId}`,
    { chainId, name: chainId === 25 ? 'cronos' : 'cronos-testnet' },
    { staticNetwork: true },
  );
}

/**
 * Primary read-only provider.
 *
 * Mainnet  → server proxy (stable, rotates nodes)
 * Testnet  → WebSocket direct to drpc.org (fastest, most reliable for 338)
 *            falls back to HTTP proxy if WSS is unavailable
 */
export function getReadProvider(chainId: number): ethers.JsonRpcProvider | ethers.WebSocketProvider {
  if (chainId !== 338) {
    // Mainnet: always use server proxy
    return getProxyProvider(chainId);
  }
  // Testnet: prefer WSS direct connection
  const wss = getTestnetWssProvider();
  if (wss) return wss;
  // WSS unavailable (non-browser env or connection failed): fall back to HTTP proxy
  return getProxyProvider(chainId);
}

/**
 * getDexProvider — used for swap quotes, pool reads.
 * Same logic as getReadProvider but always returns a JsonRpcProvider
 * so callers that need .send() directly can use it safely.
 */
export function getDexProvider(chainId: number): ethers.JsonRpcProvider {
  // For testnet: use drpc.org HTTP directly (not server proxy, much faster)
  if (chainId === 338) {
    return new ethers.JsonRpcProvider(
      TESTNET_HTTP,
      { chainId: 338, name: 'cronos-testnet' },
      { staticNetwork: true },
    );
  }
  return getProxyProvider(chainId);
}

/**
 * getSigner provider — returns BrowserProvider + signer.
 * ONLY used for transaction signing, never for reads.
 */
export async function getSignerProvider(): Promise<{
  provider: ethers.BrowserProvider;
  signer: ethers.JsonRpcSigner;
}> {
  if (!window.ethereum) throw new Error('No wallet detected. Please install MetaMask.');
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return { provider, signer };
}

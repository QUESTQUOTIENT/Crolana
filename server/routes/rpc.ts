/**
 * server/routes/rpc.ts
 *
 * Server-side JSON-RPC proxy for Cronos EVM.
 * - Avoids CORS blocks when calling evm.cronos.org from browser
 * - Rotates through multiple public endpoints on 403/429/503
 * - Proper headers that Cronos public nodes expect
 * - Returns structured errors instead of raw proxy failures
 */

import { Router, Request, Response } from 'express';

const router = Router();

// ── RPC endpoint registry ───────────────────────────────────────────────────
// Listed in priority order. Add your private node / Alchemy key in .env as
// CRONOS_MAINNET_RPC for best reliability.

const MAINNET_RPCS = [
  process.env.CRONOS_MAINNET_RPC,          // user-supplied (highest priority)
  'https://evm.cronos.org',
  'https://cronos.blockpi.network/v1/rpc/public',
  'https://1rpc.io/cro',
  'https://cronos-evm-rpc.publicnode.com',
  'https://rpc.ankr.com/cronos',
].filter(Boolean) as string[];

const TESTNET_RPCS = [
  process.env.CRONOS_TESTNET_RPC,                                    // user-supplied (highest priority)
  'https://cronos-testnet.drpc.org',                                 // drpc.org — primary (most reliable)
  'https://evm-t3.cronos.org',                                       // official Cronos testnet fallback
  'https://cronos-testnet.blockpi.network/v1/rpc/public',            // BlockPI fallback
  'https://cronos-testnet-rpc.publicnode.com',                       // PublicNode fallback
  'https://rpc.ankr.com/cronos_testnet',                             // Ankr fallback
].filter(Boolean) as string[];

function getEndpoints(chainId: string): string[] {
  return chainId === '338' ? TESTNET_RPCS : MAINNET_RPCS;
}

// ── Request headers ─────────────────────────────────────────────────────────
// Some public RPCs return 403 on plain Node.js fetch without these headers.
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; Crolana/1.0; +https://crolana.app)',
  'Origin': 'https://app.ebisusbay.com',   // known allowlisted origin on Cronos nodes
  'Referer': 'https://app.ebisusbay.com/',
});

// ── Core proxy with endpoint rotation ───────────────────────────────────────
async function proxyRpc(
  endpoints: string[],
  body: unknown,
  timeoutMs = 15_000,
): Promise<{ data: unknown; status: number }> {
  let lastErr = 'All endpoints failed';

  for (const url of endpoints) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        return { data, status: 200 };
      }

      lastErr = `${url} → HTTP ${res.status}`;
      // 400 = bad request — no point trying other nodes with same payload
      if (res.status === 400) break;
      // 403/429/503 → try next node
      continue;
    } catch (err: any) {
      clearTimeout(timer);
      lastErr = err.name === 'AbortError'
        ? `${url} timed out after ${timeoutMs}ms`
        : `${url} error: ${err.message}`;
    }
  }

  // All nodes failed — return a valid JSON-RPC error so ethers doesn't crash
  const reqId = (body as any)?.id ?? null;
  const jsonrpc = (body as any)?.jsonrpc ?? '2.0';
  return {
    status: 502,
    data: {
      jsonrpc,
      id: reqId,
      error: { code: -32603, message: lastErr },
    },
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** POST /api/rpc/:chainId — primary JSON-RPC proxy */
router.post('/:chainId', async (req: Request, res: Response) => {
  const { chainId } = req.params;
  const endpoints = getEndpoints(chainId ?? '25');
  // Testnet RPCs are generally slower — use a longer timeout
  const timeout = chainId === '338' ? 20_000 : 15_000;
  const { data, status } = await proxyRpc(endpoints, req.body, timeout);
  return res.status(status).json(data);
});

/** GET /api/rpc/:chainId — network detection (ethers may send GET for eth_chainId) */
router.get('/:chainId', async (req: Request, res: Response) => {
  const { chainId } = req.params;
  const endpoints = getEndpoints(chainId ?? '25');
  const { data, status } = await proxyRpc(endpoints, {
    jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [],
  });
  return res.status(status).json(data);
});

export default router;

/**
 * src/lib/jupiterSwap.ts
 *
 * Jupiter Aggregator V6 — token swap for Solana.
 *
 * Implementation follows the Jupiter V6 API pattern from:
 * https://www.quicknode.com/guides/solana-development/3rd-party-integrations/jupiter-api-trading-bot
 *
 * Flow (3 steps):
 *  1. getJupiterQuote()        → GET /api/solana/jupiter/quote  (server proxies to quote-api.jup.ag/v6/quote)
 *  2. buildJupiterSwapTx()     → POST /api/solana/jupiter/swap  (server proxies to quote-api.jup.ag/v6/swap)
 *  3. signAndSendSolanaSwap()  → Phantom.signAndSendTransaction() + confirm via RPC proxy
 *
 * All network calls go through the Express server proxy to avoid CORS.
 * @solana/web3.js is dynamically imported (excluded from Vite pre-bundle).
 */

const JUPITER_PROXY = '/api/solana/jupiter';

// ─── RPC proxy helper ─────────────────────────────────────────────────────────
function getRpcProxyUrl(cluster: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return cluster === 'devnet'
    ? `${origin}/api/solana/rpc/devnet`
    : `${origin}/api/solana/rpc`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JupiterQuoteResult {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

// ─── Step 1: Get best-price quote ─────────────────────────────────────────────

export async function getJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;       // raw integer lamports/token-units as string
  slippageBps?: number; // default 50 = 0.5%
  cluster?: string;
}): Promise<JupiterQuoteResult> {
  const { inputMint, outputMint, amount, slippageBps = 50, cluster = 'mainnet-beta' } = params;

  if (cluster !== 'mainnet-beta') {
    throw new Error(
      'Jupiter aggregator only operates on Solana Mainnet. Switch network to Mainnet to use swap.',
    );
  }

  // Use URLSearchParams + string concat — new URL('/relative') throws in browser
  const qs = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps:        String(slippageBps),
    onlyDirectRoutes:   'false',
    asLegacyTransaction:'false',
  });

  const res = await fetch(`${JUPITER_PROXY}/quote?${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as any).error ?? (err as any).message ?? `Jupiter quote failed: ${res.status}`);
  }
  return res.json();
}

// ─── Step 2: Build serialised VersionedTransaction ───────────────────────────

export async function buildJupiterSwapTx(params: {
  quoteResponse: JupiterQuoteResult;
  userPublicKey: string;
  wrapUnwrapSOL?: boolean;
}): Promise<string> {
  const { quoteResponse, userPublicKey, wrapUnwrapSOL = true } = params;

  const res = await fetch(`${JUPITER_PROXY}/swap`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol:          wrapUnwrapSOL,
      dynamicComputeUnitLimit:   true,
      prioritizationFeeLamports: 'auto',  // Jupiter picks optimal priority fee
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as any).error ?? (err as any).message ?? `Jupiter swap build failed: ${res.status}`);
  }

  const { swapTransaction } = await res.json();
  return swapTransaction; // base64-encoded VersionedTransaction
}

// ─── Step 3: Sign with Phantom & confirm ──────────────────────────────────────

export async function signAndSendSolanaSwap(params: {
  swapTransactionBase64: string;
  cluster?: string;
}): Promise<string> {
  const { swapTransactionBase64, cluster = 'mainnet-beta' } = params;

  if (!window.solana?.isPhantom) {
    throw new Error('Phantom wallet not found. Install from https://phantom.app');
  }
  if (!window.solana.publicKey) {
    throw new Error('Phantom not connected. Please connect your wallet first.');
  }

  // Deserialise the base64 VersionedTransaction Jupiter returned
  const web3     = await import('@solana/web3.js');
  const txBuf    = Buffer.from(swapTransactionBase64, 'base64');
  const transaction = web3.VersionedTransaction.deserialize(txBuf);

  // All Solana JSON-RPC calls go through the server proxy (avoids CORS + rotates RPCs)
  const rpcUrl    = getRpcProxyUrl(cluster);
  const connection = new web3.Connection(rpcUrl, 'confirmed');

  // signAndSendTransaction is the correct Phantom API for VersionedTransaction
  // (sendTransaction is only for legacy Transaction objects)
  const { signature } = await window.solana.signAndSendTransaction(transaction);

  // Poll for confirmation — up to ~90s (lastValidBlockHeight window)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return signature;
}

// ─── Jupiter token price (USD) ────────────────────────────────────────────────

export async function getJupiterTokenPrice(
  mint: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${JUPITER_PROXY}/price?ids=${mint}&vsToken=USDC`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data as any).data?.[mint]?.price ?? null;
  } catch {
    return null;
  }
}

// ─── Amount helpers ───────────────────────────────────────────────────────────

/** Convert decimal token amount (e.g. "1.5") to raw integer string for Jupiter */
export function solAmountToLamports(amount: string, decimals: number): string {
  try {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return '0';
    return Math.floor(num * 10 ** decimals).toString();
  } catch {
    return '0';
  }
}

/** Convert raw lamport/unit string to human-readable decimal */
export function lamportsToDisplay(lamports: string, decimals: number, precision = 6): string {
  try {
    const num = parseInt(lamports, 10) / 10 ** decimals;
    if (num === 0) return '0';
    if (num < 0.000001) return '< 0.000001';
    return num.toFixed(precision).replace(/\.?0+$/, '');
  } catch {
    return '0';
  }
}

export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

export function isNativeSOL(mint: string): boolean {
  return mint === NATIVE_SOL_MINT;
}

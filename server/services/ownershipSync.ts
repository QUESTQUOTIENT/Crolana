/**
 * server/services/ownershipSync.ts
 * ─────────────────────────────────────────────────────────────
 * NFT OWNERSHIP SYNC  (Fix #11)
 * LIGHT INDEXING LAYER  (Fix #12)
 *
 * Syncs NFT ownership for both Cronos (EVM) and Solana wallets
 * by delegating to chain-specific APIs:
 *   - Cronos  → Covalent API (EVM, no rate-limiting pain)
 *   - Solana  → Helius DAS API (getAssetsByOwner)
 *
 * This is the "light indexer" approach — we use hosted APIs instead
 * of running a full on-chain indexer, which would be overkill here.
 *
 * Usage:
 *   const syncer = OwnershipSyncer.getInstance();
 *
 *   // Sync a wallet's NFTs and get the result
 *   const result = await syncer.syncWallet({ wallet: '0x...', chain: 'cronos' });
 *
 *   // Query the cache
 *   const nfts = syncer.getCachedNFTs('0x...', 'cronos');
 */

import { fromEVMNFT, fromSolanaNFT, type UnifiedNFT } from '../../src/lib/unifiedNFT.js';
import { syncLog } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncChain = 'cronos' | 'solana';

export interface SyncOptions {
  wallet: string;
  chain: SyncChain;
  contractAddress?: string;  // EVM: filter by contract
  forceRefresh?: boolean;
}

export interface SyncResult {
  wallet: string;
  chain: SyncChain;
  nfts: UnifiedNFT[];
  total: number;
  syncedAt: number;
  source: 'cache' | 'covalent' | 'helius' | 'rpc-fallback';
  error?: string;
}

interface CacheEntry {
  nfts: UnifiedNFT[];
  syncedAt: number;
  source: SyncResult['source'];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;   // 5 min
const COVALENT_CHAIN_ID = {
  cronos: '25',
  'cronos-testnet': '338',
};

// ─── OwnershipSyncer singleton ────────────────────────────────────────────────

export class OwnershipSyncer {
  private static _instance: OwnershipSyncer;
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<SyncResult>>();

  static getInstance(): OwnershipSyncer {
    if (!OwnershipSyncer._instance) OwnershipSyncer._instance = new OwnershipSyncer();
    return OwnershipSyncer._instance;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Sync and return NFTs for a wallet. Deduplicates concurrent requests. */
  async syncWallet(opts: SyncOptions): Promise<SyncResult> {
    const key = this.cacheKey(opts.wallet, opts.chain, opts.contractAddress);

    // Serve from cache if fresh
    if (!opts.forceRefresh) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.syncedAt < CACHE_TTL_MS) {
        return {
          wallet: opts.wallet, chain: opts.chain,
          nfts: cached.nfts, total: cached.nfts.length,
          syncedAt: cached.syncedAt, source: 'cache',
        };
      }
    }

    // Deduplicate in-flight requests for the same wallet/chain
    if (this.inFlight.has(key)) return this.inFlight.get(key)!;

    const promise = this.doSync(opts).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  /** Get currently cached NFTs without triggering a sync. */
  getCachedNFTs(wallet: string, chain: SyncChain, contractAddress?: string): UnifiedNFT[] {
    const key = this.cacheKey(wallet, chain, contractAddress);
    return this.cache.get(key)?.nfts ?? [];
  }

  /** Invalidate cache for a wallet (e.g. after a mint/transfer). */
  invalidate(wallet: string, chain: SyncChain): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${chain}:${wallet.toLowerCase()}`)) {
        this.cache.delete(key);
      }
    }
  }

  // ── Sync implementations ───────────────────────────────────────────────────

  private async doSync(opts: SyncOptions): Promise<SyncResult> {
    try {
      if (opts.chain === 'cronos') return await this.syncCronos(opts);
      return await this.syncSolana(opts);
    } catch (err: any) {
      syncLog.error('Sync failed', { chain: opts.chain as any, wallet: opts.wallet, error: err.message });
      return {
        wallet: opts.wallet, chain: opts.chain,
        nfts: [], total: 0, syncedAt: Date.now(),
        source: 'rpc-fallback', error: err.message,
      };
    }
  }

  // ── Cronos (EVM) via Covalent ─────────────────────────────────────────────

  private async syncCronos(opts: SyncOptions): Promise<SyncResult> {
    const covalentKey = process.env.COVALENT_API_KEY;

    if (covalentKey) {
      return this.syncCronosCovalent(opts, covalentKey);
    }

    // Moralis fallback
    const moralisKey = process.env.MORALIS_API_KEY;
    if (moralisKey) {
      return this.syncCronosMoralis(opts, moralisKey);
    }

    // Direct RPC fallback — very limited (no metadata)
    // No API key configured
    syncLog.warn('No COVALENT_API_KEY or MORALIS_API_KEY set — Cronos NFT sync disabled', { chain: 'cronos' });
    return {
      wallet: opts.wallet, chain: opts.chain,
      nfts: [], total: 0, syncedAt: Date.now(),
      source: 'rpc-fallback',
      error: 'Set COVALENT_API_KEY or MORALIS_API_KEY for NFT ownership sync',
    };
  }

  private async syncCronosCovalent(opts: SyncOptions, apiKey: string): Promise<SyncResult> {
    const chainId = COVALENT_CHAIN_ID.cronos;
    const qs = new URLSearchParams({ limit: '100', 'no-spam': 'true' });
    if (opts.contractAddress) qs.set('contract-address', opts.contractAddress);

    const url = `https://api.covalenthq.com/v1/${chainId}/address/${opts.wallet}/balances_nft/?${qs}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) throw new Error(`Covalent API returned ${res.status}: ${await res.text()}`);

    const json: any = await res.json();
    const items: any[] = json.data?.items ?? [];

    // Flatten ERC-721: each item may have multiple nft_data entries
    const nfts: UnifiedNFT[] = [];
    for (const item of items) {
      const contractAddress = item.contract_address;
      for (const nftData of (item.nft_data ?? [{ token_id: null }])) {
        const raw = {
          contractAddress,
          tokenId: nftData.token_id ?? nftData.token_id,
          name: item.contract_name ?? 'Unknown',
          ...((nftData.external_data as any) ?? {}),
          owner: opts.wallet,
        };
        nfts.push(fromEVMNFT(raw, 'cronos'));
      }
    }

    const entry: CacheEntry = { nfts, syncedAt: Date.now(), source: 'covalent' };
    this.cache.set(this.cacheKey(opts.wallet, opts.chain, opts.contractAddress), entry);
    syncLog.info(`Cronos sync complete`, { chain: 'cronos', total: nfts.length, source: 'covalent', wallet: opts.wallet });
    return { wallet: opts.wallet, chain: opts.chain, nfts, total: nfts.length, syncedAt: entry.syncedAt, source: 'covalent' };
  }

  private async syncCronosMoralis(opts: SyncOptions, apiKey: string): Promise<SyncResult> {
    const chainHex = '0x19'; // Cronos mainnet
    const url = `https://deep-index.moralis.io/api/v2.2/${opts.wallet}/nft?chain=${chainHex}&format=decimal&media_items=false`;
    const res = await fetch(url, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Moralis API returned ${res.status}`);
    const json: any = await res.json();
    const items: any[] = json.result ?? [];

    const nfts = items.map((item: any) => {
      const meta = typeof item.metadata === 'string' ? tryParse(item.metadata) : (item.metadata ?? {});
      return fromEVMNFT({
        contractAddress: item.token_address,
        tokenId: item.token_id,
        owner: opts.wallet,
        tokenURI: item.token_uri,
        ...meta,
      }, 'cronos');
    });

    const entry: CacheEntry = { nfts, syncedAt: Date.now(), source: 'covalent' }; // label it covalent
    this.cache.set(this.cacheKey(opts.wallet, opts.chain, opts.contractAddress), entry);

    return { wallet: opts.wallet, chain: opts.chain, nfts, total: nfts.length, syncedAt: entry.syncedAt, source: 'covalent' };
  }

  // ── Solana via Helius DAS ─────────────────────────────────────────────────

  private async syncSolana(opts: SyncOptions): Promise<SyncResult> {
    const heliusKey = process.env.HELIUS_API_KEY;
    const rpc = heliusKey
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
      : 'https://mainnet.helius-rpc.com/?api-key=public';

    let allNfts: UnifiedNFT[] = [];
    let page = 1;
    const limit = 100;

    while (true) {
      const body = {
        jsonrpc: '2.0', id: `sync-${page}`, method: 'getAssetsByOwner',
        params: {
          ownerAddress: opts.wallet,
          page,
          limit,
          displayOptions: { showFungible: false, showNativeBalance: false },
        },
      };

      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        if (page === 1) throw new Error(`Helius DAS returned ${res.status}`);
        break; // partial sync — use what we have
      }

      const json: any = await res.json();
      if (json.error) throw new Error(json.error.message ?? 'Helius DAS error');

      const items: any[] = json.result?.items ?? [];
      if (items.length === 0) break;

      const pageNfts = items
        .filter((item: any) => item.interface !== 'FungibleToken' && item.interface !== 'FungibleAsset')
        .map((item: any) => fromSolanaNFT(item));

      allNfts = allNfts.concat(pageNfts);
      if (items.length < limit) break;
      page++;
    }

    const source: SyncResult['source'] = heliusKey ? 'helius' : 'rpc-fallback';
    const entry: CacheEntry = { nfts: allNfts, syncedAt: Date.now(), source };
    this.cache.set(this.cacheKey(opts.wallet, opts.chain), entry);

    return {
      wallet: opts.wallet, chain: opts.chain,
      nfts: allNfts, total: allNfts.length,
      syncedAt: entry.syncedAt, source,
    };
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private cacheKey(wallet: string, chain: SyncChain, contractAddress?: string): string {
    return `${chain}:${wallet.toLowerCase()}${contractAddress ? `:${contractAddress.toLowerCase()}` : ''}`;
  }
}

// ─── Light indexer endpoint helper ───────────────────────────────────────────

/**
 * Get recent NFT transfer history for a wallet.
 * Uses Covalent for EVM, Helius tx history for Solana.
 *
 * This is the "light indexer" — we don't run our own indexer,
 * we delegate to professional APIs.
 */
export async function getNFTTransferHistory(
  wallet: string,
  chain: SyncChain,
  limit = 25,
): Promise<unknown[]> {
  if (chain === 'cronos') {
    const covalentKey = process.env.COVALENT_API_KEY;
    if (!covalentKey) return [];
    const url = `https://api.covalenthq.com/v1/25/address/${wallet}/transactions_v3/?limit=${limit}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${covalentKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    return json.data?.items ?? [];
  }

  // Solana: use Helius transaction history
  const heliusKey = process.env.HELIUS_API_KEY;
  if (!heliusKey) return [];
  const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusKey}&limit=${limit}&type=NFT_MINT,NFT_SALE,NFT_LISTING,TRANSFER`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tryParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}

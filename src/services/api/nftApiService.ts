/**
 * src/services/api/nftApiService.ts
 * Frontend service for NFT generation API.
 */

import { apiClient } from './apiClient';

export interface TraitLayer {
  id: string;
  name: string;
  order: number;
  traits: Array<{
    id: string;
    name: string;
    weight: number;
    imageData?: string;
  }>;
}

export interface GeneratedNFTSummary {
  id: number;
  name: string;
  description: string;
  dnaHash: string;
  attributes: Array<{ trait_type: string; value: string }>;
  rarity: number;
  rarityRank: number;
  rarityLabel: string;
  isLegendary: boolean;
}

export interface GenerationResult {
  success: boolean;
  totalGenerated: number;
  uniqueCount: number;
  rarityBreakdown: {
    mythic: number;
    legendary: number;
    epic: number;
    rare: number;
    uncommon: number;
    common: number;
  };
  distribution: Record<string, Record<string, number>>;
  nfts: GeneratedNFTSummary[];
}

export interface TokenTemplate {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
}

export const nftApiService = {
  /** Generate a full NFT collection using the server-side nft-engine */
  generateCollection(params: {
    collectionName: string;
    collectionDescription?: string;
    totalSupply: number;
    layers: TraitLayer[];
    seed?: number;
  }): Promise<GenerationResult> {
    return apiClient.post('/api/nft/generate', params);
  },

  /** Build metadata JSON for a single NFT given its IPFS images CID */
  buildMetadata(params: {
    nft: GeneratedNFTSummary;
    ipfsImagesCid: string;
    options?: { royaltyBps?: number; royaltyAddr?: string; externalUrl?: string };
  }): Promise<Record<string, unknown>> {
    return apiClient.post('/api/nft/metadata', params);
  },

  /** Get pool info for a liquidity pair */
  getPoolInfo(tokenA: string, tokenB: string, chainId: number) {
    return apiClient.get<{
      exists: boolean;
      pairAddress: string | null;
      token0: string;
      token1: string;
      reserve0: string;
      reserve1: string;
      totalSupply: string;
    }>(`/api/pool/info?tokenA=${encodeURIComponent(tokenA)}&tokenB=${encodeURIComponent(tokenB)}&chainId=${chainId}`);
  },

  /** Get a wallet's LP position for a pool */
  getLPPosition(pairAddress: string, walletAddress: string, chainId: number) {
    return apiClient.get<{
      lpBalance: string;
      share: number;
      sharePercent: string;
      token0Amount: string;
      token1Amount: string;
    }>(`/api/pool/position?pair=${encodeURIComponent(pairAddress)}&wallet=${encodeURIComponent(walletAddress)}&chainId=${chainId}`);
  },

  /** Get available ERC-20 token templates */
  getTokenTemplates(): Promise<{ templates: TokenTemplate[] }> {
    return apiClient.get('/api/token/templates');
  },
};

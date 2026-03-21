/**
 * server/services/engines/nftEngineAdapter.ts
 *
 * Server-side adapter that connects backend controllers to packages/nft-engine.
 * Controllers call these functions — they never import from packages/ directly.
 *
 * This separation means:
 *  - The nft-engine package stays pure (no Express/server imports)
 *  - The controller stays thin (no engine logic)
 *  - The adapter handles env config, error wrapping, and DB persistence
 */

import {
  generateCollection,
  rankByRarity,
  buildMetadata,
  computeDNA,
  getTraitDistribution,
  getRarityLabel,
  type GenerationOptions,
  type GeneratedNFT,
  type NFTMetadata,
  type TraitLayer,
} from '../../../packages/nft-engine/index.js';

export interface GenerateCollectionInput {
  collectionName: string;
  collectionDescription: string;
  totalSupply: number;
  layers: TraitLayer[];
  seed?: number;
}

export interface GenerateCollectionOutput {
  nfts: GeneratedNFT[];
  distribution: Record<string, Record<string, number>>;
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
}

/**
 * Generate a complete NFT collection using the nft-engine.
 * Validates inputs, runs generation, computes rarity ranks, and returns stats.
 */
export async function generateNFTCollection(
  input: GenerateCollectionInput,
  onProgress?: (current: number, total: number) => void,
): Promise<GenerateCollectionOutput> {
  if (!input.collectionName?.trim()) {
    throw new Error('Collection name is required');
  }
  if (!input.totalSupply || input.totalSupply < 1 || input.totalSupply > 100000) {
    throw new Error('Total supply must be between 1 and 100,000');
  }
  if (!input.layers?.length) {
    throw new Error('At least one trait layer is required');
  }

  const options: GenerationOptions = {
    collectionName:       input.collectionName.trim(),
    collectionDescription: input.collectionDescription?.trim() ?? '',
    totalSupply:          input.totalSupply,
    layers:               input.layers,
    seed:                 input.seed ?? Date.now(),
    maxAttempts:          100,
  };

  const nfts = await generateCollection(options, onProgress);
  const ranked = rankByRarity(nfts);
  const distribution = getTraitDistribution(ranked);

  // Count by rarity tier
  const rarityBreakdown = ranked.reduce(
    (acc, nft) => {
      const label = getRarityLabel(nft.rarity).toLowerCase() as keyof typeof acc;
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    },
    { mythic: 0, legendary: 0, epic: 0, rare: 0, uncommon: 0, common: 0 },
  );

  return {
    nfts: ranked,
    distribution,
    totalGenerated:  ranked.length,
    uniqueCount:     new Set(ranked.map((n) => n.dnaHash)).size,
    rarityBreakdown,
  };
}

/**
 * Build OpenSea-compatible metadata for a single NFT given its IPFS images CID.
 */
export function buildNFTMetadata(
  nft: GeneratedNFT,
  ipfsImagesCid: string,
  options?: { royaltyBps?: number; royaltyAddr?: string; externalUrl?: string },
): NFTMetadata {
  return buildMetadata(nft, ipfsImagesCid, options);
}

/**
 * Validate a DNA hash is unique within an existing collection.
 * Used when adding NFTs incrementally (e.g., from a CSV or manual input).
 */
export function isDNAUnique(
  attributes: Array<{ trait_type: string; value: string }>,
  existingHashes: Set<string>,
): boolean {
  const dna = computeDNA(attributes);
  return !existingHashes.has(dna);
}

export { getRarityLabel, getTraitDistribution };

/**
 * src/lib/unifiedNFT.ts
 * ─────────────────────────────────────────────────────────────
 * UNIFIED NFT DATA MODEL  (Fix #2)
 *
 * A single chain-aware schema that works for both Cronos (EVM)
 * and Solana NFTs, with conversion helpers from raw on-chain data.
 */

import type { SupportedChain } from './chainAdapter';

// ─── Core unified type ────────────────────────────────────────────────────────

export interface UnifiedNFT {
  // ── Identity ────────────────────────────────────────────────
  id: string;               // internal DB / cache id
  chain: SupportedChain;

  // ── Chain-specific identifiers ──────────────────────────────
  mintAddress?: string;     // Solana mint pubkey
  contractAddress?: string; // EVM contract address  (ERC-721 / ERC-1155)
  tokenId?: string;         // EVM token ID (BigInt as string)

  // ── Standard metadata (OpenSea-compatible) ──────────────────
  name: string;
  description?: string;
  image?: string;           // resolved image URL
  animationUrl?: string;
  externalUrl?: string;
  metadataUri?: string;     // raw URI (ipfs:// or https://)
  attributes: NFTAttribute[];

  // ── Collection ──────────────────────────────────────────────
  collectionId?: string;        // our DB collection id
  collectionName?: string;
  collectionMint?: string;      // Solana collection mint pubkey
  collectionContract?: string;  // EVM collection contract

  // ── Ownership ───────────────────────────────────────────────
  owner: string;
  ownerSince?: string;          // ISO timestamp

  // ── Marketplace ─────────────────────────────────────────────
  isListed: boolean;
  listPrice?: string;           // in native units (wei or lamports) as string
  listPriceFormatted?: string;  // human-readable e.g. "1.5 CRO" or "0.3 SOL"
  listingTxHash?: string;
  marketplace?: 'native' | 'blur' | 'opensea' | 'tensor' | 'magic-eden';

  // ── Token standard ──────────────────────────────────────────
  standard?: 'ERC721' | 'ERC1155' | 'Metaplex' | 'pNFT' | 'cNFT' | 'SPL';

  // ── Royalties ───────────────────────────────────────────────
  royaltyBps?: number;          // basis points, e.g. 500 = 5%
  royaltyRecipient?: string;

  // ── Supply (ERC-1155 / editions) ────────────────────────────
  supply?: number;
  maxSupply?: number;
  editionNumber?: number;

  // ── Rarity ──────────────────────────────────────────────────
  rarityScore?: number;
  rarityRank?: number;
  rarityLabel?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

  // ── Timestamps ──────────────────────────────────────────────
  mintedAt?: string;            // ISO
  updatedAt?: string;           // ISO

  // ── Raw on-chain data ───────────────────────────────────────
  raw?: Record<string, unknown>;
}

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
  display_type?: 'string' | 'number' | 'boost_percentage' | 'boost_number' | 'date';
  max_value?: number;
}

// ─── Marketplace listing ─────────────────────────────────────────────────────

export interface NFTListing {
  id: string;
  nftId: string;
  chain: SupportedChain;

  // EVM
  contractAddress?: string;
  tokenId?: string;

  // Solana
  mintAddress?: string;

  seller: string;
  price: string;            // native units as string
  priceFormatted: string;
  currency: string;         // 'CRO' | 'SOL'
  marketplace: string;
  listingTxHash?: string;
  saleTxHash?: string;

  status: 'active' | 'sold' | 'cancelled' | 'expired';
  listedAt: string;
  expiresAt?: string;
  soldAt?: string;
  soldTo?: string;
}

// ─── Converters ───────────────────────────────────────────────────────────────

/**
 * Normalise an EVM (Cronos) NFT from a Covalent / Moralis / contract response
 * into the UnifiedNFT shape.
 */
export function fromEVMNFT(raw: Record<string, unknown>, chain: SupportedChain = 'cronos'): UnifiedNFT {
  const meta: any = (raw.metadata as any) ?? raw;
  const attributes = normaliseAttributes((meta.attributes ?? raw.attributes) as any[]);

  return {
    id: `${chain}:${raw.contractAddress ?? raw.contract_address}:${raw.tokenId ?? raw.token_id}`,
    chain,
    contractAddress: (raw.contractAddress ?? raw.contract_address ?? '') as string,
    tokenId: String(raw.tokenId ?? raw.token_id ?? ''),
    name: (meta.name ?? raw.name ?? 'Unknown') as string,
    description: (meta.description ?? raw.description) as string | undefined,
    image: resolveImage((meta.image ?? raw.image) as string | undefined),
    animationUrl: (meta.animation_url ?? raw.animation_url) as string | undefined,
    externalUrl: (meta.external_url ?? raw.external_url) as string | undefined,
    metadataUri: (raw.tokenURI ?? raw.token_uri ?? raw.metadataUri) as string | undefined,
    attributes,
    collectionContract: (raw.contractAddress ?? raw.contract_address ?? '') as string,
    owner: (raw.owner ?? raw.ownerAddress ?? raw.owner_address ?? '') as string,
    isListed: Boolean(raw.isListed ?? raw.is_listed ?? false),
    listPrice: raw.listPrice as string | undefined,
    standard: detectEVMStandard(raw),
    royaltyBps: raw.royaltyBps as number | undefined,
    raw: raw as Record<string, unknown>,
  };
}

/**
 * Normalise a Solana NFT from Helius DAS API / Metaplex response
 * into the UnifiedNFT shape.
 */
export function fromSolanaNFT(raw: Record<string, unknown>): UnifiedNFT {
  const content: any = raw.content ?? {};
  const meta: any = content.metadata ?? raw.metadata ?? raw;
  const attributes = normaliseAttributes(meta.attributes as any[]);

  const mintAddress = (raw.id ?? raw.mintAddress ?? raw.mint ?? '') as string;

  return {
    id: `solana:${mintAddress}`,
    chain: 'solana',
    mintAddress,
    name: (meta.name ?? raw.name ?? 'Unknown') as string,
    description: (meta.description ?? raw.description) as string | undefined,
    image: resolveImage(content.links?.image ?? meta.image ?? raw.image as string),
    animationUrl: resolveImage(content.links?.animation_url ?? meta.animation_url as string),
    externalUrl: (meta.external_url ?? content.links?.external_url) as string | undefined,
    metadataUri: (content.json_uri ?? raw.uri ?? raw.metadataUri) as string | undefined,
    attributes,
    collectionMint: (raw.grouping?.find?.((g: any) => g.group_key === 'collection')?.group_value) as string | undefined,
    owner: ((raw.ownership as any)?.owner ?? raw.owner ?? '') as string,
    isListed: Boolean(raw.isListed ?? false),
    listPrice: raw.listPrice as string | undefined,
    standard: detectSolanaStandard(raw),
    royaltyBps: (raw.royalty as any)?.basis_points as number | undefined,
    royaltyRecipient: ((raw.royalty as any)?.creators?.[0]?.address) as string | undefined,
    raw: raw as Record<string, unknown>,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveImage(uri?: string): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return uri;
}

function normaliseAttributes(raw: any[]): NFTAttribute[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === 'object' && 'trait_type' in a)
    .map((a) => ({
      trait_type: String(a.trait_type),
      value: a.value,
      display_type: a.display_type,
      max_value: a.max_value,
    }));
}

function detectEVMStandard(raw: any): UnifiedNFT['standard'] {
  const type = (raw.tokenType ?? raw.token_type ?? raw.contractType ?? '').toString().toUpperCase();
  if (type.includes('1155')) return 'ERC1155';
  return 'ERC721';
}

function detectSolanaStandard(raw: any): UnifiedNFT['standard'] {
  const compression = raw.compression;
  if (compression?.compressed) return 'cNFT';
  const tokenStandard = raw.content?.metadata?.token_standard;
  if (tokenStandard === 'ProgrammableNonFungible') return 'pNFT';
  return 'Metaplex';
}

/**
 * Serialise a UnifiedNFT to a JSON-safe DB record (strips File objects etc.)
 */
export function toDBRecord(nft: UnifiedNFT): Record<string, unknown> {
  const { raw: _raw, ...rest } = nft;
  return {
    ...rest,
    attributes: JSON.stringify(rest.attributes),
  };
}

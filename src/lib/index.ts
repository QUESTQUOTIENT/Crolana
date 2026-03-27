/**
 * src/lib/index.ts
 * ─────────────────────────────────────────────────────────────
 * Barrel export for all multi-chain system modules.
 *
 * Import from here instead of individual files:
 *   import { getChainAdapter, parseChainError, useUnifiedWallet } from '@/lib';
 */

// Fix #1 — Chain Abstraction Layer
export {
  getChainAdapter,
  detectChainFromAddress,
  ChainAdapterError,
  type ChainAdapter,
  type SupportedChain,
  type MintNFTParams,
  type ListNFTParams,
  type BuyNFTParams,
  type GetNFTsParams,
  type UnifiedNFTResult,
  type TransactionResult,
} from './chainAdapter';

// Fix #2 — Unified NFT Data Model
export {
  fromEVMNFT,
  fromSolanaNFT,
  toDBRecord,
  resolveUri,
  type UnifiedNFT,
  type NFTAttribute,
  type NFTListing,
  type Creator,
} from './unifiedNFT';

// Fix #8 — Chain-Specific Error Handling
export {
  parseChainError,
  useChainErrorHandler,
  type ParsedChainError,
} from './chainErrors';

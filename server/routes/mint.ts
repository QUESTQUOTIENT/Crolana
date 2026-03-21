/**
 * server/routes/mint.ts
 * Full mint management routes — phases, whitelist, Merkle trees, wallet tracking.
 * Auth middleware applied to write operations (Gap #3).
 */

import express from 'express';
import {
  generateMerkleTree,
  getMerkleProof,
  createMintPhase,
  getMintPhases,
  updateMintPhase,
  deleteMintPhase,
  addWhitelistEntries,
  getWhitelistEntries,
  checkWhitelistStatus,
  removeWhitelistEntry,
  recordWalletMint,
  getWalletMintStatus,
  getActivePhase,
} from '../controllers/mintController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Merkle tree — public (used during mint flow, no auth needed)
router.post('/merkle/generate', generateMerkleTree);
router.post('/merkle/proof', getMerkleProof);

// Mint phases — writes require auth (Gap #3)
router.post('/phases', requireAuth, createMintPhase);
router.get('/phases/:collectionId', getMintPhases);
router.put('/phases/:id', requireAuth, updateMintPhase);
router.delete('/phases/:id', requireAuth, deleteMintPhase);
router.get('/phases/:collectionId/active', getActivePhase);

// Whitelist — writes require auth
router.post('/whitelist', requireAuth, addWhitelistEntries);
router.get('/whitelist/:collectionId', getWhitelistEntries);
router.get('/whitelist/check', checkWhitelistStatus);
router.delete('/whitelist', requireAuth, removeWhitelistEntry);

// Wallet mint tracking — optionalAuth (records public mint events, but enriches if authed)
router.post('/record', optionalAuth, recordWalletMint);
router.get('/status', getWalletMintStatus);

export default router;

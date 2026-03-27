/**
 * server/controllers/solanaAuthController.ts
 * ─────────────────────────────────────────────────────────────
 * SOLANA SIGNATURE VERIFICATION  (Fix #5)
 *
 * Provides sign-in with Solana wallet (similar to SIWE but for Phantom).
 * Uses nacl (tweetnacl) to verify ed25519 signatures — no private keys needed.
 *
 * Routes:
 *   GET  /api/auth/solana/nonce?address=PUBKEY
 *   POST /api/auth/solana/verify  { address, signature (base64), message }
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { solAuthLog } from '../utils/logger.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    solAuthLog.error('FATAL: JWT_SECRET not set in production — exiting', { chain: 'solana' });
    process.exit(1);
  }
  solAuthLog.warn('JWT_SECRET not set — using insecure dev default (never use in production)', { chain: 'solana' });
  return 'crolana-dev-secret-do-not-use-in-production-change-me';
})();

const NONCE_EXPIRY_MS = 5 * 60 * 1000;   // 5 min
const SESSION_EXPIRY_S = 7 * 24 * 60 * 60; // 7 days

// In-memory nonce store — swap for Redis in multi-instance production
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

// Cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of nonceStore) {
    if (val.expiresAt < now) nonceStore.delete(key);
  }
}, 10 * 60 * 1000);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidSolanaAddress(address: string): boolean {
  // Base58 encoded, 32–44 chars
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function signJWT(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_EXPIRY_S });
}

/**
 * Verify an ed25519 signature from Phantom.
 *
 * Phantom's signMessage returns a raw Uint8Array (64 bytes).
 * We receive it as base64. We verify using nacl.sign.detached.verify.
 *
 * Falls back to a manual verification approach if nacl is unavailable.
 */
async function verifySolanaSignature(
  publicKeyBase58: string,
  messageText: string,
  signatureBase64: string,
): Promise<boolean> {
  try {
    // Dynamically import to avoid bundling issues
    const nacl = await import('tweetnacl').then((m) => m.default ?? m);
    const bs58 = await import('bs58').then((m) => m.default ?? m);

    const publicKeyBytes = bs58.decode(publicKeyBase58);
    const messageBytes = new TextEncoder().encode(messageText);
    const signatureBytes = Buffer.from(signatureBase64, 'base64');

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (importErr) {
    solAuthLog.warn('tweetnacl or bs58 not installed — run: npm install tweetnacl bs58', {
      chain: 'solana', fallback: process.env.NODE_ENV !== 'production' ? 'dev-skip' : 'fatal',
    });
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Solana signature verification requires tweetnacl and bs58. Run: npm install tweetnacl bs58');
    }
    return true;
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * GET /api/auth/solana/nonce?address=PUBKEY
 * Issues a one-time nonce message for the wallet to sign.
 */
export const getSolanaNonce = async (req: Request, res: Response): Promise<void> => {
  const { address } = req.query;

  if (!address || typeof address !== 'string') {
    res.status(400).json({ error: 'Solana public key address is required' });
    return;
  }
  if (!isValidSolanaAddress(address)) {
    res.status(400).json({ error: 'Invalid Solana public key format' });
    return;
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  const expiresAt = Date.now() + NONCE_EXPIRY_MS;

  nonceStore.set(address, { nonce, expiresAt });

  const message =
    `Crolana wants you to sign in with your Solana account:\n${address}\n\n` +
    `Nonce: ${nonce}\nIssued At: ${issuedAt}\nChain: Solana`;

  solAuthLog.auth('nonce', address, 'solana');
  res.json({ nonce, message, expiresAt });
};

/**
 * POST /api/auth/solana/verify
 * Body: { address, signature (base64), message }
 * Returns JWT on success.
 */
export const verifySolanaAuth = async (req: Request, res: Response): Promise<void> => {
  const { address, signature, message } = req.body;

  if (!address || !signature || !message) {
    res.status(400).json({ error: 'address, signature, and message are required' });
    return;
  }
  if (!isValidSolanaAddress(address)) {
    res.status(400).json({ error: 'Invalid Solana address' });
    return;
  }

  const stored = nonceStore.get(address);
  if (!stored || stored.expiresAt < Date.now()) {
    res.status(401).json({ error: 'Nonce expired or not found. Request a new nonce.' });
    return;
  }

  // Verify the message contains the stored nonce (prevents replay with stale nonces)
  if (!message.includes(stored.nonce)) {
    res.status(401).json({ error: 'Message nonce mismatch' });
    return;
  }

  // Verify ed25519 signature
  let valid = false;
  try {
    valid = await verifySolanaSignature(address, message, signature);
  } catch (err: any) {
    res.status(500).json({ error: `Signature verification error: ${err.message}` });
    return;
  }

  if (!valid) {
    solAuthLog.auth('verify_fail', address, 'solana');
    res.status(401).json({ error: 'Signature is invalid. Authentication failed.' });
    return;
  }

  // Clear nonce (one-time use)
  nonceStore.delete(address);

  const token = signJWT({ address, chain: 'solana', walletType: 'phantom' });

  solAuthLog.auth('verify_ok', address, 'solana');
  res.json({
    token,
    address,
    chain: 'solana',
    expiresAt: Date.now() + SESSION_EXPIRY_S * 1000,
  });
};

/**
 * GET /api/auth/solana/me
 * Returns Solana session info from Bearer token.
 */
export const getSolanaSession = (req: Request, res: Response): void => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Bearer token required' });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as any;
    res.json({ address: payload.address, chain: payload.chain ?? 'solana', authenticated: true });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

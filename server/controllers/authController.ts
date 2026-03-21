import { Request, Response } from 'express';
import { ethers } from 'ethers';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authLog } from '../utils/logger.js';

// ── In-memory nonce store (swap for Redis in production for multi-instance setups) ──
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

// FIXED: JWT_SECRET must be stable across restarts. Using crypto.randomBytes() as a
// default causes every server restart to invalidate ALL existing user sessions.
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    authLog.error('FATAL: JWT_SECRET not set in production — session tokens will be invalid on restart', { chain: 'cronos' });
    process.exit(1);
  }
  authLog.warn('JWT_SECRET not set — using insecure dev default (never use in production)', { chain: 'cronos' });
  return 'crolana-dev-secret-do-not-use-in-production-change-me';
})();

const NONCE_EXPIRY_MS  = 5 * 60 * 1000;
const SESSION_EXPIRY_S = 7 * 24 * 60 * 60;

// Periodic nonce cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of nonceStore.entries()) {
    if (val.expiresAt < now) nonceStore.delete(key);
  }
}, 10 * 60 * 1000);

function signJWT(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_EXPIRY_S });
}

function verifyJWT(token: string): { address: string; chainId: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return { address: payload.address, chainId: payload.chainId };
  } catch {
    return null;
  }
}

/** GET /api/auth/nonce?address=0x... */
export const getNonce = async (req: Request, res: Response) => {
  const { address } = req.query;
  if (!address || typeof address !== 'string' || !ethers.isAddress(address)) {
    return res.status(400).json({ error: 'Valid Ethereum address required' });
  }
  const checksummed = ethers.getAddress(address);
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + NONCE_EXPIRY_MS;
  nonceStore.set(checksummed.toLowerCase(), { nonce, expiresAt });
  const message =
    `Crolana wants you to sign in with your Ethereum account:\n${checksummed}\n\n` +
    `Nonce: ${nonce}\nIssued At: ${new Date().toISOString()}\nChain ID: 25`;
  authLog.auth('nonce', checksummed, 'cronos');
  res.json({ nonce, message, expiresAt });
};

/** POST /api/auth/verify */
export const verifySignature = async (req: Request, res: Response) => {
  const { address, signature, message, chainId = 25 } = req.body;
  if (!address || !signature || !message) {
    return res.status(400).json({ error: 'address, signature, and message are required' });
  }
  let checksummed: string;
  try { checksummed = ethers.getAddress(address); }
  catch { return res.status(400).json({ error: 'Invalid address' }); }

  const stored = nonceStore.get(checksummed.toLowerCase());
  if (!stored || stored.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Nonce expired or not found. Request a new nonce.' });
  }
  let recovered: string;
  try { recovered = ethers.verifyMessage(message, signature); }
  catch { return res.status(401).json({ error: 'Failed to recover signer from signature' }); }

  if (recovered.toLowerCase() !== checksummed.toLowerCase()) {
    authLog.auth('verify_fail', checksummed, 'cronos', { reason: 'signature_mismatch' });
    return res.status(401).json({ error: 'Signature mismatch' });
  }
  nonceStore.delete(checksummed.toLowerCase());
  const token = signJWT({ address: checksummed, chainId });
  authLog.auth('verify_ok', checksummed, 'cronos', { chainId });
  res.json({ token, address: checksummed, chainId, expiresAt: Date.now() + SESSION_EXPIRY_S * 1000 });
};

/** GET /api/auth/me */
export const getSession = async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Bearer token required' });
  }
  const payload = verifyJWT(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });
  res.json({ address: payload.address, chainId: payload.chainId, authenticated: true });
};

/** POST /api/auth/logout */
export const logout = async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out. Discard your JWT.' });
};

export { verifyJWT };

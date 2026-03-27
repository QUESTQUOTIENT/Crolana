/**
 * server/utils/logger.ts
 * ─────────────────────────────────────────────────────────────
 * CHAIN-SPECIFIC STRUCTURED LOGGER
 *
 * Provides consistent, tagged, levelled logging across all chain
 * operations. Every log line includes:
 *   - ISO timestamp
 *   - Log level  (INFO / WARN / ERROR / DEBUG)
 *   - Component  ([cronos:auth], [solana:marketplace], [txTracker], …)
 *   - Message
 *   - Optional structured data (latency, txHash, wallet, etc.)
 *
 * In production (NODE_ENV=production) outputs JSON for log aggregators.
 * In development outputs colour-coded plaintext.
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   const log = logger('solana:marketplace');
 *   log.info('NFT listed', { mintAddress, price, wallet });
 *   log.warn('Helius rate-limited, falling back', { attempt: 2 });
 *   log.error('Signature verification failed', { address, code: 'SIG_MISMATCH' });
 *   log.rpc('getAssetsByOwner', 'mainnet.helius-rpc.com', 142); // ms latency
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ChainTag = 'cronos' | 'solana' | 'both';

export interface LogMeta {
  chain?:       ChainTag;
  wallet?:      string;
  txHash?:      string;
  mintAddress?: string;
  latencyMs?:   number;
  statusCode?:  number;
  method?:      string;
  path?:        string;
  requestId?:   string;
  [key: string]: unknown;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const IS_PROD   = process.env.NODE_ENV === 'production';
const IS_DEBUG  = process.env.LOG_LEVEL === 'debug';
const NO_COLOR  = process.env.NO_COLOR !== undefined || IS_PROD;

const LEVEL_COLOUR: Record<LogLevel, string> = {
  debug: '\x1b[90m',   // grey
  info:  '\x1b[36m',   // cyan
  warn:  '\x1b[33m',   // yellow
  error: '\x1b[31m',   // red
};
const CHAIN_COLOUR: Record<string, string> = {
  cronos: '\x1b[32m',  // green
  solana: '\x1b[35m',  // magenta
  both:   '\x1b[34m',  // blue
};
const RESET = '\x1b[0m';

function colour(str: string, code: string): string {
  return NO_COLOR ? str : `${code}${str}${RESET}`;
}

function ts(): string {
  return new Date().toISOString();
}

function formatMeta(meta: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  // Mask wallet addresses beyond first 6 + last 4 chars
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string' && (k === 'wallet' || k === 'address') && v.length > 12) {
      safe[k] = `${v.slice(0, 6)}…${v.slice(-4)}`;
    } else {
      safe[k] = v;
    }
  }
  return IS_PROD
    ? JSON.stringify(safe)
    : ' ' + Object.entries(safe).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
}

// ─── Core write ───────────────────────────────────────────────────────────────

function write(level: LogLevel, component: string, message: string, meta: LogMeta = {}): void {
  if (level === 'debug' && !IS_DEBUG) return;

  if (IS_PROD) {
    // JSON output — pipe into Datadog, Papertrail, CloudWatch, etc.
    process.stdout.write(JSON.stringify({
      ts:        ts(),
      level:     level.toUpperCase(),
      component,
      message,
      ...meta,
    }) + '\n');
    return;
  }

  // Dev: colour-coded plaintext
  const chain       = meta.chain as string | undefined;
  const levelStr    = colour(`[${level.toUpperCase()}]`.padEnd(7), LEVEL_COLOUR[level]);
  const compStr     = chain
    ? `${colour(`[${component}]`, CHAIN_COLOUR[chain] ?? '\x1b[37m')}`
    : `\x1b[90m[${component}]\x1b[0m`;
  const latencyStr  = meta.latencyMs !== undefined
    ? colour(` (${meta.latencyMs}ms)`, meta.latencyMs > 2000 ? '\x1b[31m' : meta.latencyMs > 800 ? '\x1b[33m' : '\x1b[90m')
    : '';

  const metaClone = { ...meta };
  delete metaClone.chain;
  delete metaClone.latencyMs;

  process.stdout.write(
    `\x1b[90m${ts()}\x1b[0m ${levelStr} ${compStr} ${message}${latencyStr}${formatMeta(metaClone)}\n`
  );
}

// ─── Logger factory ───────────────────────────────────────────────────────────

export interface ChainLogger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  /** Convenience: log an RPC call with its latency */
  rpc(method: string, host: string, latencyMs: number, ok?: boolean): void;
  /** Convenience: log a tx status change */
  tx(txHash: string, status: string, meta?: LogMeta): void;
  /** Convenience: log an auth event */
  auth(event: 'nonce' | 'verify_ok' | 'verify_fail' | 'reject', address: string, chain: ChainTag, meta?: LogMeta): void;
}

export function logger(component: string, defaultChain?: ChainTag): ChainLogger {
  const base = (level: LogLevel, message: string, meta: LogMeta = {}) =>
    write(level, component, message, { ...(defaultChain && { chain: defaultChain }), ...meta });

  return {
    debug: (m, meta = {}) => base('debug', m, meta),
    info:  (m, meta = {}) => base('info',  m, meta),
    warn:  (m, meta = {}) => base('warn',  m, meta),
    error: (m, meta = {}) => base('error', m, meta),

    rpc(method: string, host: string, latencyMs: number, ok = true): void {
      const level: LogLevel = ok ? (latencyMs > 2000 ? 'warn' : 'debug') : 'warn';
      base(level, ok ? `RPC ${method}` : `RPC ${method} FAILED`, {
        chain: defaultChain, rpc: host.replace(/\?.*/, ''), latencyMs,
      });
    },

    tx(txHash: string, status: string, meta: LogMeta = {}): void {
      const level: LogLevel = status === 'failed' ? 'warn' : 'info';
      base(level, `TX ${status}`, { ...(defaultChain && { chain: defaultChain }), txHash: txHash.slice(0, 16) + '…', status, ...meta });
    },

    auth(event, address, chain, meta = {}): void {
      const level: LogLevel = event === 'verify_fail' || event === 'reject' ? 'warn' : 'info';
      const messages: Record<string, string> = {
        nonce:       'Nonce issued',
        verify_ok:   'Auth verified ✓',
        verify_fail: 'Auth failed — signature invalid',
        reject:      'Auth rejected — expired or missing token',
      };
      base(level, messages[event] ?? event, { chain, wallet: address, ...meta });
    },
  };
}

// ─── HTTP request logger middleware ──────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const httpLog = logger('http');

/**
 * requestLogger — Express middleware.
 * Logs every request with method, path, chain context, status, and latency.
 * Mount in server.ts BEFORE all routes:
 *   app.use(requestLogger);
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start     = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);
  (req as any).requestId = requestId;

  // Derive chain from path for richer logging
  const chain: ChainTag | undefined =
    req.path.startsWith('/api/solana')   ? 'solana' :
    req.path.startsWith('/api/cronos')   ? 'cronos' :
    req.path.startsWith('/api/auth/solana') ? 'solana' :
    req.path.startsWith('/api/auth')     ? 'cronos' :
    undefined;

  res.on('finish', () => {
    const latencyMs = Date.now() - start;
    const level: LogLevel =
      res.statusCode >= 500 ? 'error' :
      res.statusCode >= 400 ? 'warn'  : 'info';

    // Skip noisy health checks and static assets in debug mode
    if (!IS_DEBUG && (req.path === '/health' || req.path.startsWith('/assets'))) return;

    write(level, 'http', `${req.method} ${req.path}`, {
      ...(chain && { chain }),
      statusCode: res.statusCode,
      latencyMs,
      requestId,
    });
  });

  next();
}

// ─── Pre-built loggers for each subsystem ────────────────────────────────────

export const cronosLog   = logger('cronos',      'cronos');
export const solanaLog   = logger('solana',      'solana');
export const authLog     = logger('auth',        'cronos');
export const solAuthLog  = logger('solana:auth', 'solana');
export const txLog       = logger('txTracker');
export const syncLog     = logger('ownershipSync');
export const marketLog   = logger('marketplace');

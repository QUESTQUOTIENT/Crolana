import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import ipfsRoutes from './server/routes/ipfs.js';
import contractRoutes from './server/routes/contract.js';
import mintRoutes from './server/routes/mint.js';
import tokenRoutes from './server/routes/token.js';
import analyticsRoutes from './server/routes/analytics.js';
import dexRoutes from './server/routes/dex.js';
import authRoutes from './server/routes/auth.js';
import rpcRoutes from './server/routes/rpc.js';
import storageRoutes from './server/routes/storage.js';
import nftRoutes from './server/routes/nft.js';
import poolRoutes from './server/routes/pool.js';
import solanaRoutes from './server/routes/solana.js';
import chainRoutes from './server/routes/chain.js';
import { logChainConfig } from './server/utils/chainConfig.js';
import { logger, requestLogger } from './server/utils/logger.js';

const serverLog = logger('server');

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const IS_PROD = process.env.NODE_ENV === 'production';

  // ── Security headers ────────────────────────────────────────────────────
  try {
    const helmet = (await import('helmet')).default;
    app.use(helmet({
      // CSP disabled: helmet's default 'script-src: self' blocks our inline
      // scripts (Buffer shim + theme anti-FOUC) and Phantom wallet's inpage.js.
      // Railway handles network-level security. We set permissive connect-src
      // via the custom directives below instead of the broken default CSP.
      contentSecurityPolicy: false,
      // Required for Web3 wallets — they use cross-origin iframes/resources
      crossOriginEmbedderPolicy: false,
    }));
  } catch { serverLog.warn('helmet not installed — skipping (run: npm install)'); }

  // ── CORS ────────────────────────────────────────────────────────────────
  // Railway env var often lacks the protocol prefix (e.g. "crolana-production.up.railway.app")
  // but browsers always send the full origin ("https://crolana-production.up.railway.app").
  // We normalise by adding https:// when no protocol is present.
  function normaliseOrigin(raw: string): string[] {
    const o = raw.trim();
    if (!o) return [];
    if (o.startsWith('http://') || o.startsWith('https://')) return [o];
    // No protocol — add both https and http variants
    return [`https://${o}`, `http://${o}`];
  }

  const allowedOrigins: string[] = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').flatMap(normaliseOrigin)
    : ['http://localhost:3000', 'http://localhost:5173'];

  // Always allow localhost in development
  if (process.env.NODE_ENV !== 'production') {
    if (!allowedOrigins.includes('http://localhost:3000'))  allowedOrigins.push('http://localhost:3000');
    if (!allowedOrigins.includes('http://localhost:5173'))  allowedOrigins.push('http://localhost:5173');
  }

  serverLog.info('CORS origins configured', { origins: allowedOrigins });

  app.use(cors({
    origin: (origin, callback) => {
      // Allow server-to-server (no origin) and all listed origins
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
  }));

  // ── Body parsing ────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── HTTP request logger — logs every route with chain context + latency ─
  app.use(requestLogger);

  // ── Rate limiting ───────────────────────────────────────────────────────
  try {
    const { rateLimit } = await import('express-rate-limit');
    const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
    const compileLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many compile/deploy requests.' } });
    // RPC proxy gets a more generous limit since the DEX quote polling hits it frequently
    const rpcLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'RPC rate limit reached. Please slow down.' } });
    app.use('/api/', apiLimiter);
    app.use('/api/rpc', rpcLimiter);
    app.use('/api/solana', rpcLimiter);   // Solana proxy same limit as Cronos RPC
    app.use('/api/contract/compile', compileLimiter);
    app.use('/api/contract/deploy', compileLimiter);
    app.use('/api/token/compile', compileLimiter);
    app.use('/api/token/deploy', compileLimiter);
  } catch { serverLog.warn('express-rate-limit not installed — skipping (run: npm install)'); }

  // ── Ensure uploads directory exists ────────────────────────────────────
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  // ── API Routes ──────────────────────────────────────────────────────────
  app.use('/api/ipfs', ipfsRoutes);
  app.use('/api/storage', storageRoutes);
  app.use('/api/contract', contractRoutes);
  app.use('/api/mint', mintRoutes);
  app.use('/api/token', tokenRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/dex', dexRoutes);
  app.use('/api/nft', nftRoutes);
  app.use('/api/pool', poolRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/solana', solanaRoutes);
  app.use('/api/rpc', rpcRoutes);
  // ── Unified chain routes (Fix #10) ─────────────────────────────────────────
  // Provides /api/cronos/*, /api/solana/marketplace/*, /api/tx/*, /api/metadata/*
  // and /api/auth/solana/* — the clean multi-chain API surface.
  app.use('/api', chainRoutes);

  // ── Health check ────────────────────────────────────────────────────────
  // IMPORTANT: Must be registered BEFORE static file middleware so it always
  // responds in production (static middleware would intercept it otherwise).
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '7.1.0',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
    });
  });

  // ── Frontend ─────────────────────────────────────────────────────────────
  if (!IS_PROD) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(distPath)) {
      serverLog.warn('dist/ not found — run `npm run build` first');
    } else {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }
  }

  // ── 404 handler ──────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    if (_req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API route not found' });
    } else {
      res.status(404).send('Not Found');
    }
  });

  // ── Global error handler ─────────────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as any).status || 500;
    const message = IS_PROD && status === 500 ? 'Internal server error' : err.message;
    serverLog.error('Unhandled request error', { statusCode: status, error: err.message, stack: IS_PROD ? undefined : err.stack });
    res.status(status).json({ error: message });
  });

  // ── Start ────────────────────────────────────────────────────────────────
  app.listen(PORT, '0.0.0.0', () => {
    serverLog.info(`Crolana v7 running at http://localhost:${PORT}`, {
      env: process.env.NODE_ENV || 'development',
      port: PORT,
      uploads: uploadsDir,
    });
    logChainConfig();
  });
}

// ── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  serverLog.info('SIGTERM received — shutting down gracefully');
  process.exit(0);
});
process.on('SIGINT', () => {
  serverLog.info('SIGINT received — shutting down');
  process.exit(0);
});
process.on('unhandledRejection', (reason) => {
  serverLog.error('Unhandled promise rejection', { error: String(reason) });
});

startServer().catch((err) => {
  serverLog.error('Server failed to start', { error: err?.message ?? String(err), stack: err?.stack });
  process.exit(1);
});

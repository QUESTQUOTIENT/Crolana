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

  // Railway (and most PaaS) sit behind a reverse proxy / load balancer that sets
  // X-Forwarded-For. Without trust proxy = 1, express-rate-limit throws
  // ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request → floods logs with
  // "Unhandled request error" and causes unstable responses on mobile.
  app.set('trust proxy', 1);

  // ── Sentry (backend error monitoring) ──────────────────────────────────────
  // Initialises only when SENTRY_DSN env var is set. Fully opt-in, no-op otherwise.
  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = await import('@sentry/node');
      Sentry.init({
        dsn:              process.env.SENTRY_DSN,
        environment:      process.env.NODE_ENV ?? 'production',
        tracesSampleRate: 0.1,
      });
      serverLog.info('Sentry backend monitoring initialised');
    } catch { serverLog.warn('Sentry init failed — continuing without monitoring'); }
  }

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
      // Allow server-to-server requests (no origin header — e.g. same-origin, mobile webviews)
      if (!origin) return callback(null, true);
      // Allow all listed origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Auto-allow Railway deployment domains (*.up.railway.app)
      // This handles the case where ALLOWED_ORIGINS is not explicitly set in Railway env
      if (origin.endsWith('.railway.app') || origin.endsWith('.up.railway.app')) {
        return callback(null, true);
      }
      callback(new Error(`CORS: Origin ${origin} not allowed`));
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
  // Serve dist/ if it exists (production build present) regardless of NODE_ENV.
  // Fall back to Vite dev server only when dist/ is absent AND not in production.
  const distPath = path.join(process.cwd(), 'dist');
  const distExists = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));

  if (distExists) {
    // Production: serve the pre-built Vite output
    serverLog.info('Serving pre-built frontend from dist/');
    app.use(express.static(distPath, {
      maxAge: '1y',
      immutable: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));
    // SPA fallback — serves index.html for all non-API routes
    app.get('*', (_req, res) => {
      if (_req.path.startsWith('/api/')) return;
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else if (!IS_PROD) {
    // Dev: spin up Vite middleware
    serverLog.info('Starting Vite dev server...');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    serverLog.error('dist/ not found in production — build may have failed');
    // Return 503 for all non-API routes so it's obvious something is wrong
    app.get('*', (_req, res) => {
      if (_req.path.startsWith('/api/')) return;
      res.status(503).send('Frontend not built. Run npm run build.');
    });
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

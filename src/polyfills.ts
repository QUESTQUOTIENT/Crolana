/**
 * src/polyfills.ts
 *
 * Browser polyfills for Node.js globals required by @solana/web3.js,
 * @metaplex-foundation/* and related packages.
 *
 * MUST be the very first import in src/main.tsx.
 *
 * Two-layer strategy:
 *   Layer 1: Synchronous inline shim in index.html (before SES lockdown)
 *   Layer 2: This file replaces the shim with the real 'buffer' npm package
 *            immediately after the module graph loads.
 */

// ─── Real Buffer from npm 'buffer' package ────────────────────────────────────
import { Buffer as RealBuffer } from 'buffer';

// Install the real Buffer unconditionally — overwrites the inline shim from index.html
(globalThis as any).Buffer = RealBuffer;
if (typeof window !== 'undefined') {
  (window as any).Buffer = RealBuffer;
}

// ─── process ─────────────────────────────────────────────────────────────────
if (typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = {
    env:     { NODE_ENV: import.meta.env.MODE ?? 'development' },
    version: 'v20.0.0',
    browser: true,
    nextTick: (fn: () => void) => setTimeout(fn, 0),
  };
} else {
  // Ensure process.browser is set (used by some Solana/Metaplex internals)
  (globalThis as any).process.browser = true;
  if (!(globalThis as any).process.nextTick) {
    (globalThis as any).process.nextTick = (fn: () => void) => setTimeout(fn, 0);
  }
}

// ─── TextEncoder / TextDecoder ────────────────────────────────────────────────
// Belt-and-suspenders: some very old browsers and Phantom WebView contexts
// may not have these. @solana/web3.js uses them extensively.
if (typeof (globalThis as any).TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = class {
    encode(s: string) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }
  };
}

export {};

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

// Overwrite the inline shim with the real implementation unconditionally.
// SES lockdown (from @metaplex-foundation/umi-bundle-defaults) runs AFTER
// module evaluation. Setting these on globalThis here happens BEFORE lockdown,
// so SES cannot remove them (it only strips from the realm's intrinsic slots,
// not from custom window properties set before lockdown).
(globalThis as any).Buffer = RealBuffer;
if (typeof window !== 'undefined') {
  (window as any).Buffer = RealBuffer;
}

// ─── process ─────────────────────────────────────────────────────────────────
if (typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = {
    env: { NODE_ENV: import.meta.env.MODE ?? 'development' },
    version: 'v20.0.0',
    browser: true,
    nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
      setTimeout(() => fn(...args), 0),
  };
} else {
  const p = (globalThis as any).process;
  // Ensure process.browser is set (used by some Solana/Metaplex internals)
  p.browser = true;
  if (!p.nextTick) {
    p.nextTick = (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
      setTimeout(() => fn(...args), 0);
  }
  if (!p.env) p.env = {};
  if (!p.env.NODE_ENV) p.env.NODE_ENV = import.meta.env.MODE ?? 'development';
}

// ─── TextEncoder / TextDecoder ────────────────────────────────────────────────
// Belt-and-suspenders for very old mobile WebViews and Phantom in-app browser.
if (typeof (globalThis as any).TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = class {
    encode(s: string) {
      return new Uint8Array([...s].map(c => c.charCodeAt(0)));
    }
  };
}
if (typeof (globalThis as any).TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = class {
    decode(buf: Uint8Array) {
      return String.fromCharCode(...Array.from(buf));
    }
  };
}

// ─── crypto.getRandomValues ───────────────────────────────────────────────────
// Required by tweetnacl + @solana/web3.js key generation.
// Available on all modern browsers but guard anyway for old Android WebView.
if (
  typeof (globalThis as any).crypto === 'undefined' ||
  typeof (globalThis as any).crypto.getRandomValues === 'undefined'
) {
  (globalThis as any).crypto = {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  };
}

// ─── queueMicrotask ──────────────────────────────────────────────────────────
// Used by some Metaplex utilities. Polyfill for iOS <13.
if (typeof (globalThis as any).queueMicrotask === 'undefined') {
  (globalThis as any).queueMicrotask = (fn: () => void) =>
    Promise.resolve().then(fn);
}

export {};

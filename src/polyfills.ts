/**
 * src/polyfills.ts
 *
 * Browser polyfills for Node.js globals required by @solana/web3.js,
 * @metaplex-foundation/* and related packages.
 *
 * MUST be the very first import in src/main.tsx.
 *
 * Execution order matters:
 *   1. index.html inline scripts run synchronously (Buffer shim + theme)
 *   2. This file runs as the first ES module — replaces shims with real impls
 *   3. SES lockdown runs (from @metaplex-foundation/umi-bundle-defaults)
 *   4. App code runs
 *
 * Properties set on globalThis/window BEFORE SES lockdown survive lockdown.
 * SES only strips from JS realm intrinsics, not custom window properties.
 */

// ─── Buffer ───────────────────────────────────────────────────────────────────
import { Buffer as RealBuffer } from 'buffer';
(globalThis as any).Buffer = RealBuffer;
if (typeof window !== 'undefined') (window as any).Buffer = RealBuffer;

// ─── BN (BigNumber) ───────────────────────────────────────────────────────────
// "TypeError: can't access property 'BN', n is undefined"
//
// Root cause: bn.js is CJS (`module.exports = BN`). Packages like
// @metaplex/beet and borsh import it as `import { BN } from 'bn.js'`.
// Rollup's CJS→ESM interop can fail to surface the named export.
// Setting it as a global ensures all consumers find it regardless of
// how their import resolves through the bundle.
import BN from 'bn.js';
(globalThis as any).BN = BN;
if (typeof window !== 'undefined') (window as any).BN = BN;

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
  p.browser = true;
  if (!p.nextTick) {
    p.nextTick = (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
      setTimeout(() => fn(...args), 0);
  }
  if (!p.env) p.env = {};
  if (!p.env.NODE_ENV) p.env.NODE_ENV = import.meta.env.MODE ?? 'development';
}

// ─── global ───────────────────────────────────────────────────────────────────
// Some CJS packages access `global` directly (Node.js idiom)
(globalThis as any).global = globalThis;

// ─── TextEncoder / TextDecoder ────────────────────────────────────────────────
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
if (
  typeof (globalThis as any).crypto === 'undefined' ||
  typeof (globalThis as any).crypto.getRandomValues === 'undefined'
) {
  (globalThis as any).crypto = {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    },
  };
}

// ─── queueMicrotask ───────────────────────────────────────────────────────────
if (typeof (globalThis as any).queueMicrotask === 'undefined') {
  (globalThis as any).queueMicrotask = (fn: () => void) => Promise.resolve().then(fn);
}

export {};

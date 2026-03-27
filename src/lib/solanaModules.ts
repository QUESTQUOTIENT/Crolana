/**
 * src/lib/solanaModules.ts
 *
 * Lazy loaders for @solana/web3.js and @solana/spl-token.
 *
 * These packages are excluded from Vite pre-bundling (they use Node builtins).
 * They load correctly at runtime via dynamic import now that eventemitter3 is
 * pinned to v4 (see package.json "overrides") which has proper named CJS
 * exports that @solana/web3.js expects.
 *
 * Call getWeb3() / getSplToken() at the start of any async Solana function.
 * Subsequent calls return the cached module — no double-loading.
 */

let _web3: typeof import('@solana/web3.js') | null = null;
let _spl: typeof import('@solana/spl-token') | null = null;

export async function getWeb3() {
  if (!_web3) _web3 = await import('@solana/web3.js');
  return _web3;
}

export async function getSplToken() {
  if (!_spl) _spl = await import('@solana/spl-token');
  return _spl;
}

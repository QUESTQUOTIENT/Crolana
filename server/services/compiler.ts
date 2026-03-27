/**
 * server/services/compiler.ts
 *
 * Synchronous solc compilation — Railway-proof, zero worker-thread complexity.
 *
 * WHY SYNCHRONOUS:
 *   Worker threads (both file-path and eval modes) have subtle ESM/CJS
 *   incompatibilities on Railway's Node environment:
 *     - File-path workers: compilerWorker.js never exists (only vite build runs)
 *     - eval workers:      `import { workerData } from 'worker_threads'` inside
 *                          an eval string behaves differently across Node versions
 *   The root cause is that `solc` is a CJS package and Railway's Node treats
 *   the server as ESM ("type":"module" in package.json).
 *
 *   Solution: run solc synchronously in the main thread.
 *     - Compilation takes 2–8 s — well within Railway's 60 s request timeout
 *     - createRequire(import.meta.url) is the standard way to load CJS from ESM
 *     - No Worker, no file lookup, no tsx, no execArgv — just works everywhere
 */

import { createRequire } from 'module';
import path               from 'path';
import fs                 from 'fs';

// Load the CJS solc package from ESM context
const require = createRequire(import.meta.url);
const solc     = require('solc') as {
  compile: (input: string, options?: { import: (p: string) => { contents?: string; error?: string } }) => string;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompilationResult {
  abi:          any[];
  bytecode:     string;
  source:       string;
  contractName: string;
  warnings?:    string[];
  error?:       string;
}

// ─── Import resolver ─────────────────────────────────────────────────────────
// Called by solc for every `import "..."` statement in the Solidity source.
// Searches project node_modules in priority order.

function findImports(importPath: string): { contents: string } | { error: string } {
  const roots = [
    process.cwd(),
    path.resolve(process.cwd(), 'server'),
    path.resolve(process.cwd(), 'server', 'services'),
  ];
  for (const root of roots) {
    try {
      const full = path.join(root, 'node_modules', importPath);
      if (fs.existsSync(full)) return { contents: fs.readFileSync(full, 'utf8') };
    } catch { /* try next root */ }
  }
  if (fs.existsSync(importPath)) {
    try { return { contents: fs.readFileSync(importPath, 'utf8') }; } catch {}
  }
  return { error: `Import not found: ${importPath}` };
}

// ─── Contract finder ─────────────────────────────────────────────────────────

function findContractInOutput(
  output:         any,
  sourceFileName: string,
  expectedName:   string,
): { abi: any[]; bytecode: string } | null {
  const contracts = output?.contracts;
  if (!contracts) return null;

  // 1. Exact source file + exact contract name
  const sf = contracts[sourceFileName];
  if (sf?.[expectedName]?.abi) {
    const c = sf[expectedName];
    return { abi: c.abi, bytecode: c.evm?.bytecode?.object ?? '' };
  }
  // 2. First contract in the expected source file
  if (sf) {
    const keys = Object.keys(sf);
    if (keys.length > 0 && sf[keys[0]]?.abi) {
      const c = sf[keys[0]];
      return { abi: c.abi, bytecode: c.evm?.bytecode?.object ?? '' };
    }
  }
  // 3. Any file — prefer exact name with real bytecode
  for (const [, fc] of Object.entries(contracts) as any) {
    if (typeof fc !== 'object') continue;
    if (fc[expectedName]?.evm?.bytecode?.object?.length > 100) {
      const c = fc[expectedName];
      return { abi: c.abi, bytecode: c.evm.bytecode.object };
    }
  }
  // 4. Last resort — any contract with non-empty bytecode
  for (const [, fc] of Object.entries(contracts) as any) {
    if (typeof fc !== 'object') continue;
    for (const [, c] of Object.entries(fc) as any) {
      if (c?.evm?.bytecode?.object?.length > 100) {
        return { abi: c.abi, bytecode: c.evm.bytecode.object };
      }
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function compileContract(
  sourceCode:   string,
  contractName: string,
): Promise<CompilationResult> {
  const safeName       = (contractName || '').replace(/[^a-zA-Z0-9_]/g, '') || 'Contract';
  const sourceFileName = `${safeName}.sol`;

  const solcInput = JSON.stringify({
    language: 'Solidity',
    sources:  { [sourceFileName]: { content: sourceCode } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
      optimizer:       { enabled: true, runs: 200 },
    },
  });

  let output: any;
  try {
    // Synchronous — blocks for 2–8 s, well within Railway's request timeout
    const rawOutput = solc.compile(solcInput, { import: findImports });
    output = JSON.parse(rawOutput);
  } catch (err: any) {
    console.error('[compiler] solc.compile threw:', err.message);
    return {
      abi: [], bytecode: '', source: sourceCode, contractName: safeName,
      error: `Compilation failed: ${err.message}`,
    };
  }

  const allErrors = output?.errors ?? [];
  const errors    = allErrors.filter((e: any) => e.severity === 'error');
  const warnings  = allErrors
    .filter((e: any) => e.severity === 'warning')
    .map((e: any) => e.formattedMessage ?? e.message);

  if (errors.length > 0) {
    const msg = errors.map((e: any) => e.formattedMessage ?? e.message).join('\n');
    console.error(`[compiler] Solidity errors for ${safeName}:\n`, msg.slice(0, 800));
    return { abi: [], bytecode: '', source: sourceCode, contractName: safeName, error: msg };
  }

  const found = findContractInOutput(output, sourceFileName, safeName);
  if (!found) {
    return {
      abi: [], bytecode: '', source: sourceCode, contractName: safeName,
      error:
        `Contract "${safeName}" not found in compiler output. ` +
        `Make sure the "contract ${safeName}" keyword is in your source.`,
    };
  }
  if (!found.bytecode || found.bytecode.length === 0) {
    return {
      abi: found.abi, bytecode: '', source: sourceCode, contractName: safeName,
      error: 'Compilation succeeded but produced empty bytecode ' +
             '(is this an interface or abstract contract?)',
    };
  }

  console.log(
    `[compiler] ✓ ${safeName} — ` +
    `${Math.round(found.bytecode.length / 2 / 1024)}KB bytecode, ` +
    `${found.abi.length} ABI entries` +
    (warnings.length ? `, ${warnings.length} warning(s)` : ''),
  );

  return {
    abi:          found.abi,
    bytecode:     found.bytecode,
    source:       sourceCode,
    contractName: safeName,
    warnings:     warnings.length > 0 ? warnings : undefined,
  };
}

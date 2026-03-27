/**
 * server/services/compiler.ts
 *
 * Solc compiler wrapped in a Worker thread so the Express event loop is never
 * blocked during 2–30 s compilations.
 *
 * RAILWAY FIX — why the previous approach failed:
 *
 *   Old code looked for compilerWorker.js on disk (file path resolution).
 *   On Railway, `npm run build` only runs `vite build` (frontend only) — it
 *   does NOT compile server TypeScript. So compilerWorker.js never exists.
 *   The fallback tried `--import tsx/esm` in the Worker execArgv, but Worker
 *   threads do not inherit the parent process's module loader, and tsx/esm
 *   is not always resolvable in the child thread context → crash.
 *
 * NEW APPROACH — inline eval worker:
 *
 *   Instead of pointing Worker at a file, we pass the worker code as a
 *   JavaScript string using `{ eval: true }`. No file lookup = no path
 *   resolution = no Railway / tsx incompatibility.
 *
 *   The inline code is plain CommonJS-compatible ESM that:
 *     - Uses createRequire (Node built-in) to load the CJS `solc` package
 *     - Scans process.cwd()/node_modules for Solidity import resolution
 *     - Posts { ok, output } or { ok:false, error } back to the parent
 */

import path from 'path';
import { Worker } from 'worker_threads';

// ─── Inline worker source (ESM, eval: true) ───────────────────────────────────
// Written as a plain JS string — no TypeScript, no tsx, no file system lookup.
// createRequire lets us load the CJS `solc` package from an ESM eval context.
const WORKER_CODE = `
import { workerData, parentPort } from 'worker_threads';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import fs   from 'fs';
import path from 'path';

// createRequire needs a real file:// URL — use cwd so node_modules resolves correctly
const require = createRequire(pathToFileURL(path.join(process.cwd(), 'index.js')).href);
const solc = require('solc');

function findImports(importPath) {
  // Search order: project root, server/, server/services/
  const roots = [
    process.cwd(),
    path.join(process.cwd(), 'server'),
    path.join(process.cwd(), 'server', 'services'),
  ];
  for (const root of roots) {
    try {
      const full = path.join(root, 'node_modules', importPath);
      if (fs.existsSync(full)) return { contents: fs.readFileSync(full, 'utf8') };
    } catch {}
  }
  // Absolute import fallback
  if (fs.existsSync(importPath)) {
    try { return { contents: fs.readFileSync(importPath, 'utf8') }; } catch {}
  }
  return { error: 'Import not found: ' + importPath };
}

try {
  const output = JSON.parse(
    solc.compile(JSON.stringify(workerData.input), { import: findImports })
  );
  parentPort.postMessage({ ok: true, output });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
`.trim();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompilationResult {
  abi:          any[];
  bytecode:     string;
  source:       string;
  contractName: string;
  warnings?:    string[];
  error?:       string;
}

// ─── Worker runner ────────────────────────────────────────────────────────────

function compileInWorker(input: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_CODE, {
      eval:       true,        // inline string — no file lookup
      workerData: { input },
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Compilation timed out (> 60 s). Contract may be too large.'));
    }, 60_000);

    worker.once('message', (msg) => {
      clearTimeout(timeout);
      if (msg.ok) resolve(msg.output);
      else reject(new Error(msg.error));
    });
    worker.once('error', (err) => { clearTimeout(timeout); reject(err); });
    worker.once('exit',  (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Compiler worker exited with code ${code}`));
    });
  });
}

// ─── Contract finder ─────────────────────────────────────────────────────────

function findContractInOutput(output: any, sourceFileName: string, expectedName: string) {
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
  // 3. Any file: prefer exact name with non-empty bytecode
  for (const [, fileContracts] of Object.entries(contracts) as any) {
    if (typeof fileContracts !== 'object') continue;
    if (fileContracts[expectedName]?.evm?.bytecode?.object?.length > 100) {
      const c = fileContracts[expectedName];
      return { abi: c.abi, bytecode: c.evm.bytecode.object };
    }
  }
  // 4. Last resort: any contract with non-empty bytecode
  for (const [, fileContracts] of Object.entries(contracts) as any) {
    if (typeof fileContracts !== 'object') continue;
    for (const [, c] of Object.entries(fileContracts) as any) {
      if ((c as any)?.evm?.bytecode?.object?.length > 100) {
        return { abi: (c as any).abi, bytecode: (c as any).evm.bytecode.object };
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
  const safeName      = contractName.replace(/[^a-zA-Z0-9_]/g, '') || 'Contract';
  const sourceFileName = `${safeName}.sol`;

  const input = {
    language: 'Solidity',
    sources:  { [sourceFileName]: { content: sourceCode } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
      optimizer:       { enabled: true, runs: 200 },
    },
  };

  let output: any;
  try {
    output = await compileInWorker(input);
  } catch (err: any) {
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
    return {
      abi: [], bytecode: '', source: sourceCode, contractName: safeName,
      error: errors.map((e: any) => e.formattedMessage ?? e.message).join('\n'),
    };
  }

  const found = findContractInOutput(output, sourceFileName, safeName);
  if (!found) {
    return {
      abi: [], bytecode: '', source: sourceCode, contractName: safeName,
      error: `Contract "${safeName}" not found in compiler output. ` +
             `Ensure the contract name matches the Solidity "contract" keyword.`,
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
    `${found.abi.length} ABI entries`,
  );
  return {
    abi:          found.abi,
    bytecode:     found.bytecode,
    source:       sourceCode,
    contractName: safeName,
    warnings:     warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * server/services/compiler.ts — solc compiler that never blocks the event loop.
 *
 * Railway/production fix: the worker is embedded as an eval string so there is
 * NO file-system dependency. This eliminates the "compilerWorker.js not found"
 * error that occurs on Railway because `npm run build` only compiles the frontend
 * (Vite) and the server runs via tsx — which has no compiled .js worker files.
 *
 * How it works:
 *  1. compileContract() builds the solc JSON input.
 *  2. It passes the input to a worker thread via workerData.
 *  3. The worker is a plain JS string (eval:true) — no file path needed.
 *  4. The worker uses createRequire to load solc (CJS) from the host's node_modules.
 *  5. Result is posted back to the main thread.
 *  6. A 60-second hard timeout kills hung workers.
 */

import { Worker } from 'worker_threads';
import { createRequire } from 'module';

export interface CompilationResult {
  abi: any[];
  bytecode: string;
  source: string;
  contractName: string;
  warnings?: string[];
  error?: string;
}

// ─── Inline worker code ───────────────────────────────────────────────────────
// Written as a plain CommonJS string so it runs under `eval: true` without any
// TypeScript or ESM loader. The host's require() is recreated via createRequire
// so solc (a CJS package) can be loaded from the project's node_modules.

const WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');
const { createRequire } = require('module');
const path = require('path');
const fs   = require('fs');

// Resolve solc relative to the project root — works regardless of cwd on Railway
const require2 = createRequire(process.cwd() + '/package.json');
let solc;
try {
  solc = require2('solc');
} catch (e) {
  parentPort.postMessage({ ok: false, error: 'solc not found: ' + e.message });
  process.exit(1);
}

function findImports(importPath) {
  const roots = [process.cwd(), path.resolve(process.cwd(), 'node_modules')];
  for (const root of roots) {
    try {
      const fullPath = path.join(root, 'node_modules', importPath);
      if (fs.existsSync(fullPath)) return { contents: fs.readFileSync(fullPath, 'utf8') };
    } catch {}
  }
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
`;

// ─── Worker runner ────────────────────────────────────────────────────────────

function compileInWorker(input: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_CODE, {
      eval:       true,            // run the string as code — no file path needed
      workerData: { input },
    });

    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    worker.once('message', (msg) => {
      settle(() => {
        if (msg.ok) resolve(msg.output);
        else        reject(new Error(msg.error));
      });
    });
    worker.once('error', (err) => settle(() => reject(err)));
    worker.once('exit',  (code) => {
      if (code !== 0) settle(() => reject(new Error(`Compiler worker exited with code ${code}`)));
    });

    // Hard timeout — kill worker if solc hangs on a pathological contract
    const timeout = setTimeout(() => {
      worker.terminate();
      settle(() => reject(new Error('Compilation timed out (>60 s). Contract may be too large.')));
    }, 60_000);

    // Clear timeout as soon as we hear anything
    worker.once('message', () => clearTimeout(timeout));
    worker.once('error',   () => clearTimeout(timeout));
  });
}

// ─── Output parsing ───────────────────────────────────────────────────────────

function findContractInOutput(output: any, sourceFileName: string, expectedName: string) {
  const contracts = output?.contracts;
  if (!contracts) return null;

  // 1. Exact file + exact name
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
  const safeName       = contractName.replace(/[^a-zA-Z0-9_]/g, '') || 'Contract';
  const sourceFileName = `${safeName}.sol`;

  // Adaptive optimizer runs: large contracts need fewer runs to stay under 24 KB.
  const sourceKB = sourceCode.length / 1024;
  const optRuns  = sourceKB > 16 ? 20 : sourceKB > 8 ? 50 : 200;

  const input = {
    language: 'Solidity',
    sources:  { [sourceFileName]: { content: sourceCode } },
    settings: {
      // 'paris' EVM — Cronos is post-merge but does not yet support PUSH0 (Shanghai).
      // Using 'paris' avoids invalid opcode errors on mainnet deployment.
      evmVersion:      'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
      optimizer:       { enabled: true, runs: optRuns },
    },
  };

  console.log(`[compiler] ${safeName}: ${sourceKB.toFixed(1)} KB source, optimizer runs=${optRuns}`);

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
      error: `Contract "${safeName}" not found in compiler output.`,
    };
  }
  if (!found.bytecode || found.bytecode.length === 0) {
    return {
      abi: found.abi, bytecode: '', source: sourceCode, contractName: safeName,
      error: 'Compilation succeeded but produced empty bytecode. '
           + 'If all extensions are enabled try disabling flash mint or blacklist to reduce size.',
    };
  }

  const byteSize = found.bytecode.length / 2;
  console.log(`[compiler] ✓ ${safeName} — ${byteSize} B bytecode, ${found.abi.length} ABI entries, runs=${optRuns}`);
  if (byteSize > 22_000) {
    console.warn(`[compiler] ⚠ ${safeName} is ${byteSize} B — near 24 KB deploy limit. Disable unused extensions.`);
  }

  return {
    abi:          found.abi,
    bytecode:     found.bytecode,
    source:       sourceCode,
    contractName: safeName,
    warnings:     warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * server/services/compiler.ts
 *
 * Synchronous solc compilation — Railway-proof, zero worker-thread complexity.
 *
 * Why synchronous:
 *  - Worker threads with eval:true have subtle ESM/CJS incompatibilities across
 *    Node versions and Railway's build environment.
 *  - solc is synchronous by design; it typically completes in 2–8 s for token
 *    contracts, which is well within Railway's 30 s request timeout.
 *  - This is a developer tool (not a high-concurrency API), so one blocking
 *    compile at a time is perfectly acceptable.
 *
 * solc is a CJS package; we load it via createRequire so this ESM-based
 * server can import it without issues.
 */

import { createRequire } from 'module';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load solc (CJS) from project node_modules via createRequire.
// Works on local (tsx), Railway (tsx in production), and compiled js.
const require = createRequire(import.meta.url);
let solc: any;
try {
  solc = require('solc');
} catch (e: any) {
  console.error('[compiler] FATAL: solc not found —', e.message);
  // If solc is missing the entire compile route will 500; that is the correct behaviour.
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompilationResult {
  abi:          any[];
  bytecode:     string;
  source:       string;
  contractName: string;
  warnings?:    string[];
  error?:       string;
}

// ─── Import resolver (for contracts that import OpenZeppelin etc.) ─────────────

function findImports(importPath: string): { contents: string } | { error: string } {
  const roots = [
    process.cwd(),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
  ];
  for (const root of roots) {
    try {
      const full = path.join(root, 'node_modules', importPath);
      if (fs.existsSync(full)) return { contents: fs.readFileSync(full, 'utf8') };
    } catch {}
  }
  if (fs.existsSync(importPath)) {
    try { return { contents: fs.readFileSync(importPath, 'utf8') }; } catch {}
  }
  return { error: `Import not found: ${importPath}` };
}

// ─── Output parser ────────────────────────────────────────────────────────────

function findContractInOutput(
  output:         any,
  sourceFileName: string,
  expectedName:   string,
): { abi: any[]; bytecode: string } | null {
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
    const first = Object.values(sf)[0] as any;
    if (first?.abi) return { abi: first.abi, bytecode: first.evm?.bytecode?.object ?? '' };
  }

  // 3. Any file — prefer the expected name
  for (const fileContracts of Object.values(contracts) as any[]) {
    if (typeof fileContracts !== 'object') continue;
    const exact = fileContracts[expectedName];
    if (exact?.evm?.bytecode?.object?.length > 100)
      return { abi: exact.abi, bytecode: exact.evm.bytecode.object };
  }

  // 4. Last resort — any contract with non-empty bytecode
  for (const fileContracts of Object.values(contracts) as any[]) {
    if (typeof fileContracts !== 'object') continue;
    for (const c of Object.values(fileContracts) as any[]) {
      if (c?.evm?.bytecode?.object?.length > 100)
        return { abi: c.abi, bytecode: c.evm.bytecode.object };
    }
  }

  return null;
}

// ─── Public compile function ──────────────────────────────────────────────────

// Extract the primary contract name from Solidity source.
function extractNameFromSource(source: string): string {
  const m = source.match(/\bcontract\s+([A-Za-z_][A-Za-z0-9_]*)\s*[{(]/);
  return m ? m[1] : 'Contract';
}

export async function compileContract(
  sourceCode:   string,
  contractName: string = '',
): Promise<CompilationResult> {

  if (!solc) {
    return {
      abi: [], bytecode: '', source: sourceCode, contractName,
      error: 'solc compiler not available. Run: npm install --legacy-peer-deps',
    };
  }

  // Derive a safe identifier: prefer contractName param → extract from source → 'Contract'
  const safeName = (contractName || '').replace(/[^a-zA-Z0-9_]/g, '')
    || extractNameFromSource(sourceCode)
    || 'Contract';
  const sourceFileName = `${safeName}.sol`;

  // Adaptive optimizer: large contracts need fewer runs to stay under 24 KB.
  const sourceKB = sourceCode.length / 1024;
  const optRuns  = sourceKB > 16 ? 20 : sourceKB > 8 ? 50 : 200;

  const input = {
    language: 'Solidity',
    sources:  { [sourceFileName]: { content: sourceCode } },
    settings: {
      // 'paris' — Cronos EVM does not support PUSH0 (Shanghai/Cancun).
      // Using 'paris' avoids "invalid opcode" on mainnet deployment.
      evmVersion:      'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
      optimizer:       { enabled: true, runs: optRuns },
    },
  };

  console.log(`[compiler] ${safeName}: ${sourceKB.toFixed(1)} KB, optimizer runs=${optRuns}`);

  // Compile synchronously — solc is a synchronous C++ binding.
  let output: any;
  try {
    output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  } catch (err: any) {
    console.error('[compiler] solc threw:', err.message);
    return {
      abi: [], bytecode: '', source: sourceCode, contractName: safeName,
      error: `Compiler crashed: ${err.message}`,
    };
  }

  const allErrors = output?.errors ?? [];
  const errors    = allErrors.filter((e: any) => e.severity === 'error');
  const warnings  = allErrors
    .filter((e: any) => e.severity === 'warning')
    .map((e: any) => (e.formattedMessage ?? e.message) as string);

  if (errors.length > 0) {
    const msg = errors.map((e: any) => e.formattedMessage ?? e.message).join('\n');
    console.error(`[compiler] ✗ ${safeName} —`, msg.slice(0, 400));
    return { abi: [], bytecode: '', source: sourceCode, contractName: safeName, error: msg };
  }

  const found = findContractInOutput(output, sourceFileName, safeName);
  if (!found) {
    return {
      abi: [], bytecode: '', source: sourceCode, contractName: safeName,
      error: `Contract "${safeName}" not found in compiler output. Check that the contract name matches the Solidity "contract" keyword exactly.`,
    };
  }

  if (!found.bytecode || found.bytecode.length === 0) {
    return {
      abi: found.abi, bytecode: '', source: sourceCode, contractName: safeName,
      error: 'Compilation produced empty bytecode. If all extensions are enabled, try disabling Flash Mint or Blacklist to reduce contract size below 24 KB.',
    };
  }

  const byteSize = found.bytecode.length / 2;
  console.log(`[compiler] ✓ ${safeName} — ${byteSize} B, ${found.abi.length} ABI entries, runs=${optRuns}`);
  if (byteSize > 22_000) {
    console.warn(`[compiler] ⚠ ${safeName} is ${byteSize} B — approaching 24 KB deploy limit.`);
  }

  return {
    abi:          found.abi,
    bytecode:     found.bytecode,
    source:       sourceCode,
    contractName: safeName,
    warnings:     warnings.length > 0 ? warnings : undefined,
  };
}

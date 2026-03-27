/**
 * server/services/compiler.ts — Robust solc compiler with full error handling
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CompilationResult {
  abi: any[];
  bytecode: string;
  source: string;
  contractName: string;
  warnings?: string[];
  error?: string;
}

// findImports lives in compilerWorker.ts — imported there so the worker
// has access to the file system independently of the main thread.

/** Run solc in a worker thread so the Express event loop is never blocked (2–15 s). */
function compileInWorker(input: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(__dirname, 'compilerWorker.js');
    // tsx/ts-node: fall back to .ts when .js doesn't exist yet
    const workerFile = fs.existsSync(workerPath)
      ? workerPath
      : path.resolve(__dirname, 'compilerWorker.ts');
    const worker = new Worker(workerFile, {
      workerData: { input },
      // Allow tsx to handle TypeScript workers
      execArgv: workerFile.endsWith('.ts') ? ['--import', 'tsx/esm'] : [],
    });
    worker.once('message', (msg) => {
      if (msg.ok) resolve(msg.output);
      else reject(new Error(msg.error));
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Compiler worker exited with code ${code}`));
    });
    // Hard timeout: kill worker if compilation takes > 60 s
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Compilation timed out (> 60 s). Contract may be too large.'));
    }, 60_000);
    worker.once('message', () => clearTimeout(timeout));
    worker.once('error',   () => clearTimeout(timeout));
  });
}

function findContractInOutput(output: any, sourceFileName: string, expectedName: string) {
  const contracts = output?.contracts;
  if (!contracts) return null;

  // Try exact source file + contract name first
  const sf = contracts[sourceFileName];
  if (sf?.[expectedName]?.abi) {
    const c = sf[expectedName];
    return { abi: c.abi, bytecode: c.evm?.bytecode?.object ?? '' };
  }
  // Try first contract in the expected source file
  if (sf) {
    const keys = Object.keys(sf);
    if (keys.length > 0 && sf[keys[0]]?.abi) {
      const c = sf[keys[0]];
      return { abi: c.abi, bytecode: c.evm?.bytecode?.object ?? '' };
    }
  }
  // Scan all files, prefer exact name with non-empty bytecode
  for (const [, fileContracts] of Object.entries(contracts) as any) {
    if (typeof fileContracts !== 'object') continue;
    if (fileContracts[expectedName]?.evm?.bytecode?.object?.length > 100) {
      const c = fileContracts[expectedName];
      return { abi: c.abi, bytecode: c.evm.bytecode.object };
    }
  }
  // Last resort: any contract with non-empty bytecode
  for (const [, fileContracts] of Object.entries(contracts) as any) {
    if (typeof fileContracts !== 'object') continue;
    for (const [, c] of Object.entries(fileContracts) as any) {
      if (c?.evm?.bytecode?.object?.length > 100) {
        return { abi: c.abi, bytecode: c.evm.bytecode.object };
      }
    }
  }
  return null;
}

export async function compileContract(sourceCode: string, contractName: string): Promise<CompilationResult> {
  const safeName = contractName.replace(/[^a-zA-Z0-9_]/g, '') || 'Contract';
  const sourceFileName = `${safeName}.sol`;

  const input = {
    language: 'Solidity',
    sources: { [sourceFileName]: { content: sourceCode } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  let output: any;
  try {
    output = await compileInWorker(input);
  } catch (err: any) {
    return { abi: [], bytecode: '', source: sourceCode, contractName: safeName, error: `Compilation failed: ${err.message}` };
  }

  const allErrors = output?.errors ?? [];
  const errors = allErrors.filter((e: any) => e.severity === 'error');
  const warnings = allErrors.filter((e: any) => e.severity === 'warning').map((e: any) => e.formattedMessage ?? e.message);

  if (errors.length > 0) {
    return { abi: [], bytecode: '', source: sourceCode, contractName: safeName, error: errors.map((e: any) => e.formattedMessage ?? e.message).join('\n') };
  }

  const found = findContractInOutput(output, sourceFileName, safeName);
  if (!found) {
    return { abi: [], bytecode: '', source: sourceCode, contractName: safeName, error: `Contract "${safeName}" not found in compiler output. Ensure contract name matches the Solidity "contract" keyword.` };
  }
  if (!found.bytecode || found.bytecode.length === 0) {
    return { abi: found.abi, bytecode: '', source: sourceCode, contractName: safeName, error: 'Compilation succeeded but produced empty bytecode (is this an interface or abstract contract?)' };
  }

  console.log(`[compiler] ✓ ${safeName} — ${found.bytecode.length / 2}B bytecode, ${found.abi.length} ABI entries`);
  return { abi: found.abi, bytecode: found.bytecode, source: sourceCode, contractName: safeName, warnings: warnings.length > 0 ? warnings : undefined };
}

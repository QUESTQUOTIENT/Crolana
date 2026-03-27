/**
 * server/services/compiler.ts — PRODUCTION SAFE VERSION
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

/**
 * ✅ Run solc in worker (ONLY JS — no TS fallback)
 */
function compileInWorker(input: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const workerFile = path.resolve(__dirname, 'compilerWorker.js');

    // 🔥 HARD FAIL if JS not found (prevents silent TS crash)
    if (!fs.existsSync(workerFile)) {
      return reject(
        new Error('compilerWorker.js not found. Make sure TypeScript is compiled before running.')
      );
    }

    const worker = new Worker(workerFile, {
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

    worker.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Compiler worker exited with code ${code}`));
      }
    });
  });
}

/**
 * Extract contract safely
 */
function findContractInOutput(output: any, sourceFileName: string, expectedName: string) {
  const contracts = output?.contracts;
  if (!contracts) return null;

  const sf = contracts[sourceFileName];

  if (sf?.[expectedName]?.abi) {
    const c = sf[expectedName];
    return { abi: c.abi, bytecode: c.evm?.bytecode?.object ?? '' };
  }

  if (sf) {
    const keys = Object.keys(sf);
    if (keys.length > 0 && sf[keys[0]]?.abi) {
      const c = sf[keys[0]];
      return { abi: c.abi, bytecode: c.evm?.bytecode?.object ?? '' };
    }
  }

  for (const [, fileContracts] of Object.entries(contracts) as any) {
    if (typeof fileContracts !== 'object') continue;

    if (fileContracts[expectedName]?.evm?.bytecode?.object?.length > 100) {
      const c = fileContracts[expectedName];
      return { abi: c.abi, bytecode: c.evm.bytecode.object };
    }
  }

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

/**
 * Main compile function
 */
export async function compileContract(
  sourceCode: string,
  contractName: string
): Promise<CompilationResult> {
  const safeName = contractName.replace(/[^a-zA-Z0-9_]/g, '') || 'Contract';
  const sourceFileName = `${safeName}.sol`;

  const input = {
    language: 'Solidity',
    sources: {
      [sourceFileName]: { content: sourceCode },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'],
        },
      },
    },
  };

  let output: any;

  try {
    output = await compileInWorker(input);
  } catch (err: any) {
    return {
      abi: [],
      bytecode: '',
      source: sourceCode,
      contractName: safeName,
      error: `Compilation failed: ${err.message}`,
    };
  }

  const allErrors = output?.errors ?? [];

  const errors = allErrors.filter((e: any) => e.severity === 'error');
  const warnings = allErrors
    .filter((e: any) => e.severity === 'warning')
    .map((e: any) => e.formattedMessage ?? e.message);

  if (errors.length > 0) {
    return {
      abi: [],
      bytecode: '',
      source: sourceCode,
      contractName: safeName,
      error: errors.map((e: any) => e.formattedMessage ?? e.message).join('\n'),
    };
  }

  const found = findContractInOutput(output, sourceFileName, safeName);

  if (!found) {
    return {
      abi: [],
      bytecode: '',
      source: sourceCode,
      contractName: safeName,
      error: `Contract "${safeName}" not found in compiler output.`,
    };
  }

  if (!found.bytecode || found.bytecode.length === 0) {
    return {
      abi: found.abi,
      bytecode: '',
      source: sourceCode,
      contractName: safeName,
      error: 'Compiled but no bytecode (abstract/interface?)',
    };
  }

  console.log(
    `[compiler] ✓ ${safeName} — ${found.bytecode.length / 2}B bytecode, ${found.abi.length} ABI`
  );

  return {
    abi: found.abi,
    bytecode: found.bytecode,
    source: sourceCode,
    contractName: safeName,
    warnings: warnings.length ? warnings : undefined,
  };
}
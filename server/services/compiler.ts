/**
 * server/services/compiler.ts — Robust solc compiler with full error handling
 */

import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function findImports(importPath: string): { contents: string } | { error: string } {
  const roots = [
    process.cwd(),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
  ];
  for (const root of roots) {
    try {
      const fullPath = path.join(root, 'node_modules', importPath);
      if (fs.existsSync(fullPath)) return { contents: fs.readFileSync(fullPath, 'utf8') };
    } catch {}
  }
  if (fs.existsSync(importPath)) {
    try { return { contents: fs.readFileSync(importPath, 'utf8') }; } catch {}
  }
  return { error: `Import not found: ${importPath}` };
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
    output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  } catch (err: any) {
    return { abi: [], bytecode: '', source: sourceCode, contractName: safeName, error: `Solc crashed: ${err.message}` };
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

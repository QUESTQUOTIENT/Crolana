/**
 * server/blockchain/contractLoader.ts
 * Contract interaction layer — reads on-chain state using ethers.js.
 * All contract calls go through this module for consistent error handling.
 */

import { ethers } from 'ethers';
import { getProvider } from './networkManager.js';

// ─────────────────────────────────────────────────────────────
// Standard ABIs
// ─────────────────────────────────────────────────────────────

export const ERC721_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function cost() view returns (uint256)',
  'function paused() view returns (bool)',
  'function revealed() view returns (bool)',
  'function merkleRoot() view returns (bytes32)',
  'function mintedByWallet(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

export const ERC1155_ABI = [
  'function uri(uint256 tokenId) view returns (string)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function totalSupply(uint256 id) view returns (uint256)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
];

// ─────────────────────────────────────────────────────────────
// Contract loaders
// ─────────────────────────────────────────────────────────────

export function loadContract(
  address: string,
  abi: ethers.InterfaceAbi,
  provider: ethers.JsonRpcProvider,
): ethers.Contract {
  return new ethers.Contract(ethers.getAddress(address), abi, provider);
}

export async function loadERC721(address: string, chainId: number | string): Promise<ethers.Contract> {
  const provider = await getProvider(chainId);
  return loadContract(address, ERC721_ABI, provider);
}

export async function loadERC20(address: string, chainId: number | string): Promise<ethers.Contract> {
  const provider = await getProvider(chainId);
  return loadContract(address, ERC20_ABI, provider);
}

// ─────────────────────────────────────────────────────────────
// On-chain read helpers
// ─────────────────────────────────────────────────────────────

const TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error('RPC timeout')), ms))]);
}

export interface ERC721Info {
  name: string;
  symbol: string;
  totalSupply: number;
  mintCost: string;       // In CRO
  paused: boolean;
  revealed: boolean;
  contractBalance: string; // In CRO
}

export async function getERC721Info(address: string, chainId: number | string): Promise<ERC721Info> {
  const provider = await getProvider(chainId);
  const contract = loadContract(address, ERC721_ABI, provider);

  const [name, symbol, totalSupplyBn, contractBalance] = await Promise.all([
    withTimeout(contract.name() as Promise<string>).catch(() => 'Unknown'),
    withTimeout(contract.symbol() as Promise<string>).catch(() => '???'),
    withTimeout(contract.totalSupply() as Promise<bigint>).catch(() => 0n),
    withTimeout(provider.getBalance(address)).catch(() => 0n),
  ]);

  const [mintCostWei, paused, revealed] = await Promise.all([
    withTimeout(contract.cost() as Promise<bigint>).catch(() => 0n),
    withTimeout(contract.paused() as Promise<boolean>).catch(() => false),
    withTimeout(contract.revealed() as Promise<boolean>).catch(() => true),
  ]);

  return {
    name,
    symbol,
    totalSupply: Number(totalSupplyBn),
    mintCost: ethers.formatEther(mintCostWei),
    paused,
    revealed,
    contractBalance: ethers.formatEther(contractBalance),
  };
}

export interface ERC20Info {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

export async function getERC20Info(address: string, chainId: number | string): Promise<ERC20Info> {
  const provider = await getProvider(chainId);
  const contract = loadContract(address, ERC20_ABI, provider);

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    withTimeout(contract.name() as Promise<string>),
    withTimeout(contract.symbol() as Promise<string>),
    withTimeout(contract.decimals() as Promise<bigint>),
    withTimeout(contract.totalSupply() as Promise<bigint>),
  ]);

  return {
    name,
    symbol,
    decimals: Number(decimals),
    totalSupply: ethers.formatUnits(totalSupply, Number(decimals)),
  };
}

/**
 * Detect contract type by probing ABI methods.
 */
export async function detectContractType(
  address: string,
  chainId: number | string,
): Promise<'ERC721' | 'ERC1155' | 'ERC20' | 'unknown'> {
  const provider = await getProvider(chainId);

  const erc165ABI = [
    'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  ];

  try {
    const contract = new ethers.Contract(address, erc165ABI, provider);
    const [is721, is1155] = await Promise.allSettled([
      contract.supportsInterface('0x80ac58cd'),  // ERC721
      contract.supportsInterface('0xd9b67a26'),  // ERC1155
    ]);

    if (is721.status === 'fulfilled' && is721.value) return 'ERC721';
    if (is1155.status === 'fulfilled' && is1155.value) return 'ERC1155';

    // Try ERC20 probe (no supportsInterface standard)
    const erc20 = loadContract(address, ERC20_ABI, provider);
    await withTimeout(erc20.decimals() as Promise<bigint>);
    return 'ERC20';
  } catch {
    return 'unknown';
  }
}

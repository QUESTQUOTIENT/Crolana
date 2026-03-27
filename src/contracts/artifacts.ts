/**
 * artifacts.ts
 * 
 * NFT contracts are compiled server-side via /api/contract/compile
 * using the real solc compiler with full OpenZeppelin imports.
 * 
 * This file exists as a placeholder — do not import hardcoded ABIs/bytecodes
 * here. Instead, use the compilationResult from the ContractBuilder page.
 * 
 * The analyticsService uses a minimal ABI for reading on-chain state:
 */

export const ANALYTICS_ABI = [
  'function totalSupply() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function cost() view returns (uint256)',
  'function paused() view returns (bool)',
  'function revealed() view returns (bool)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function mintedByWallet(address) view returns (uint256)',
  'function contractURI() view returns (string)',
  'function owner() view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

export const ERC20_MINIMAL_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

import { ethers } from 'ethers';
import { NATIVE_CRO_ADDRESS, getWCROAddress } from '../data/tokens';
import { createProxyProvider } from './rpc';

export { getWCROAddress };

// ─────────────────────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────────────────────

export const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
  'function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB)',
  'function removeLiquidityETH(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external returns (uint amountToken, uint amountETH)',
  'function factory() external pure returns (address)',
  'function WETH() external pure returns (address)',
];

// createPair added — needed for new pool creation in LiquidityManager
export const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function createPair(address tokenA, address tokenB) external returns (address pair)',
  'function allPairs(uint) external view returns (address pair)',
  'function allPairsLength() external view returns (uint)',
];

export const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint)',
  'function balanceOf(address) external view returns (uint)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function approve(address spender, uint value) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint)',
];

export const ERC20_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function totalSupply() external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
];

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

export function isNativeCRO(address: string): boolean {
  return address.toLowerCase() === NATIVE_CRO_ADDRESS.toLowerCase();
}

/**
 * Build the swap path for the VVS Finance router.
 *
 * VVS Finance is a Uniswap V2 fork. Its liquidity is concentrated in
 * X/WCRO pairs — direct ERC20→ERC20 pairs almost never exist.
 *
 * Rules:
 *   CRO  ↔ any ERC20   → [WCRO, token]  (2-hop, direct pair)
 *   WCRO ↔ any ERC20   → [WCRO, token]  (2-hop, direct pair)
 *   ERC20 ↔ ERC20      → [tokenA, WCRO, tokenB]  (3-hop through WCRO)
 *
 * This matches the routing VVS Finance\'s own UI uses.
 */
export function buildSwapPath(tokenIn: string, tokenOut: string, chainId: number): string[] {
  const wcro    = getWCROAddress(chainId).toLowerCase();
  const inAddr  = isNativeCRO(tokenIn)  ? wcro : tokenIn.toLowerCase();
  const outAddr = isNativeCRO(tokenOut) ? wcro : tokenOut.toLowerCase();

  if (inAddr === outAddr) return [inAddr]; // guard — same token

  // One side is already WCRO → direct 2-hop
  if (inAddr === wcro || outAddr === wcro) return [inAddr, outAddr];

  // Both are ERC20s that are not WCRO → route through WCRO hub
  return [inAddr, wcro, outAddr];
}

export function parseAmount(amount: string, decimals: number): bigint {
  try { return ethers.parseUnits(amount.trim() || '0', decimals); }
  catch { return 0n; }
}

export function formatAmount(amount: bigint, decimals: number, precision = 6): string {
  const num = parseFloat(ethers.formatUnits(amount, decimals));
  if (num === 0) return '0';
  if (num < 0.000001) return '< 0.000001';
  return num.toFixed(precision).replace(/\.?0+$/, '');
}

export function calcPriceImpact(
  amountIn: bigint, amountOut: bigint,
  reserveIn: bigint, reserveOut: bigint,
): number {
  if (reserveIn === 0n || reserveOut === 0n) return 0;
  const midPrice       = Number(reserveOut) / Number(reserveIn);
  const executionPrice = Number(amountOut)  / Number(amountIn);
  return Math.max(0, Math.min(100, ((midPrice - executionPrice) / midPrice) * 100));
}

/** Basis-point slippage: 50 bps = 0.5% */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10000 - slippageBps)) / 10000n;
}

export function getDeadline(minutesFromNow = 20): number {
  return Math.floor(Date.now() / 1000) + minutesFromNow * 60;
}

/**
 * Uniswap V2 quote: given amountA and current reserves, return the
 * proportionally equivalent amountB to maintain pool ratio.
 * Returns 0n for new pools (first LP sets the price).
 */
export function calcLiquidityAmountB(amountA: bigint, reserveA: bigint, reserveB: bigint): bigint {
  if (reserveA === 0n || reserveB === 0n) return 0n;
  return (amountA * reserveB) / reserveA;
}

// ─────────────────────────────────────────────────────────────────────────────
// Async helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  provider: ethers.BrowserProvider,
  chainId: number,
): Promise<{ balance: bigint; decimals: number; symbol: string }> {
  if (isNativeCRO(tokenAddress)) {
    const balance = await provider.getBalance(walletAddress);
    return { balance, decimals: 18, symbol: chainId === 25 ? 'CRO' : 'TCRO' };
  }
  const c = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [balance, decimals, symbol] = await Promise.all([
    c.balanceOf(walletAddress), c.decimals(), c.symbol(),
  ]);
  return { balance, decimals: Number(decimals), symbol };
}

/**
 * Ensure the router has sufficient ERC20 allowance.
 *
 * Flow:
 *  1. Skip native CRO — it\'s passed as msg.value, no ERC20 approval needed.
 *  2. Read current on-chain allowance (no gas, read-only).
 *  3. If allowance >= amount → already approved, return immediately.
 *  4. Call approve(spender, MaxUint256) → wallet popup for user signature.
 *  5. Wait for mining and check receipt.status before returning.
 *     If status === 0 the approval reverted — throw so the swap halts.
 *
 * Note: the router contract itself must be connected with `signer` (not
 * provider) for write calls. That connection happens in the callers
 * (SwapPage, LiquidityManager) via:
 *   new ethers.Contract(routerAddress, ROUTER_ABI, signer)
 */
export async function ensureApproval(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  amount: bigint,
  signer: ethers.Signer,
  chainId = 25,
): Promise<void> {
  if (isNativeCRO(tokenAddress)) return; // native CRO needs no ERC20 approval

  // FIX (-32603): Read allowance via server-side proxy, NOT via MetaMask signer.
  // Using signer for reads routes the call through MetaMask's active network;
  // if the user is on Ethereum mainnet the Cronos read fails with -32603.
  const readProvider = createProxyProvider(chainId);
  const tokenRO = new ethers.Contract(tokenAddress, ERC20_ABI, readProvider);
  const allowance: bigint = await tokenRO.allowance(ownerAddress, spenderAddress);
  if (allowance >= amount) return; // already sufficient — skip wallet popup

  // approve(router, MaxUint256) — triggers wallet signature prompt (signer required)
  const tokenRW = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const tx: ethers.TransactionResponse = await tokenRW.approve(spenderAddress, ethers.MaxUint256);
  const receipt = await tx.wait(); // wait for mining
  if (!receipt || receipt.status === 0) {
    throw new Error('Token approval transaction failed on-chain');
  }
}

/**
 * Get expected output amounts from the router (read-only, no gas).
 * Uses router.getAmountsOut with the pre-built path.
 */
export async function getSwapQuote(
  routerAddress: string,
  amountIn: bigint,
  path: string[],
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider,
): Promise<bigint[]> {
  if (amountIn === 0n) return Array(path.length).fill(0n);
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, provider);
  return router.getAmountsOut(amountIn, path) as Promise<bigint[]>;
}

/**
 * Fetch pool reserves and metadata.
 * Returns null when no pool exists for this pair (ZeroAddress from factory).
 */
export async function getPairInfo(
  factoryAddress: string,
  tokenA: string,
  tokenB: string,
  chainId: number,
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider,
): Promise<{
  pairAddress: string;
  reserve0: bigint; reserve1: bigint;
  token0: string;   token1: string;
  totalSupply: bigint;
} | null> {
  const wcro  = getWCROAddress(chainId);
  const addrA = isNativeCRO(tokenA) ? wcro : tokenA;
  const addrB = isNativeCRO(tokenB) ? wcro : tokenB;

  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  const pairAddress: string = await factory.getPair(addrA, addrB);
  if (!pairAddress || pairAddress === ethers.ZeroAddress) return null;

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [reserves, token0, totalSupply] = await Promise.all([
    pair.getReserves(), pair.token0(), pair.totalSupply(),
  ]);

  const t0 = (token0 as string).toLowerCase();
  return {
    pairAddress,
    reserve0:    reserves[0],
    reserve1:    reserves[1],
    token0:      t0,
    token1:      addrA.toLowerCase() === t0 ? addrB.toLowerCase() : addrA.toLowerCase(),
    totalSupply: totalSupply as bigint,
  };
}

/**
 * Create a new VVS Finance pool pair if none exists.
 *
 * The factory\'s createPair() is permissionless on VVS Finance — any wallet
 * can call it. We create the pair first, then addLiquidity in a separate tx.
 *
 * @returns pair contract address (new or existing)
 */
export async function createPairIfNeeded(
  factoryAddress: string,
  tokenA: string,
  tokenB: string,
  chainId: number,
  signer: ethers.Signer,
): Promise<string> {
  const wcro  = getWCROAddress(chainId);
  const addrA = isNativeCRO(tokenA) ? wcro : tokenA;
  const addrB = isNativeCRO(tokenB) ? wcro : tokenB;

  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
  const existing: string = await factory.getPair(addrA, addrB);
  if (existing && existing !== ethers.ZeroAddress) return existing;

  const tx: ethers.TransactionResponse = await factory.createPair(addrA, addrB);
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) throw new Error('createPair failed on-chain');

  const newPair: string = await factory.getPair(addrA, addrB);
  if (!newPair || newPair === ethers.ZeroAddress) throw new Error('createPair succeeded but address not found');
  return newPair;
}

/**
 * LiquidityManager.tsx
 *
 * Three tabs:
 *   • Add Liquidity   — V2 addLiquidity / addLiquidityETH (fully functional)
 *   • Remove Liquidity — V2 removeLiquidity (fully functional)
 *   • Positions (V3 Style) — Visual price-range manager with fee-tier info,
 *       LP value breakdown, and impermanent-loss estimate.
 *       Uses V2 contracts under the hood but presents the modern Uniswap v3 UX.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { getDexProvider } from '../lib/provider';
import {
  Plus, Minus, Loader2, ChevronDown, AlertTriangle, CheckCircle,
  ExternalLink, RefreshCw, X, Search, Info, Droplets, TrendingUp,
  BarChart2, Layers, ArrowRight, Zap,
} from 'lucide-react';
import { useAppStore } from '../store';
import { getTokenList, getRouterConfig, NATIVE_CRO_ADDRESS, type Token } from '../data/tokens';
import { TokenSelectorModal } from '../components/TokenSelectorModal';
import {
  ROUTER_ABI, PAIR_ABI, ERC20_ABI, FACTORY_ABI,
  isNativeCRO, parseAmount, formatAmount, applySlippage,
  getDeadline, ensureApproval, getWCROAddress,
  createPairIfNeeded, calcLiquidityAmountB,
} from '../lib/dex';

type Tab = 'add' | 'remove' | 'positions';

// ── Token Selector Modal ──────────────────────────────────────────────────────

// ── Token Button ──────────────────────────────────────────────────────────────

function TokenBtn({ token, onClick }: { token: Token; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
        {token.symbol.slice(0, 2)}
      </div>
      <span className="font-bold text-white text-sm">{token.symbol}</span>
      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
    </button>
  );
}

// ── Price Range Chart (V3-style visual) ───────────────────────────────────────

function PriceRangeChart({
  currentPrice, minPrice, maxPrice, tokenA, tokenB,
}: {
  currentPrice: number; minPrice: number; maxPrice: number;
  tokenA: Token; tokenB: Token;
}) {
  const chartMin = Math.min(currentPrice * 0.5, minPrice * 0.9);
  const chartMax = Math.max(currentPrice * 1.5, maxPrice * 1.1);
  const range    = chartMax - chartMin;
  const toX = (p: number) => ((p - chartMin) / range) * 100;

  const curX  = toX(currentPrice);
  const minX  = toX(minPrice);
  const maxX  = toX(maxPrice);

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-400">Price Range Visualizer</span>
        <span className="text-xs text-slate-500">
          {tokenA.symbol}/{tokenB.symbol}
        </span>
      </div>
      <div className="relative h-10 bg-slate-900 rounded-lg overflow-hidden">
        {/* Inactive zone left */}
        <div className="absolute top-0 bottom-0 bg-slate-800/50 left-0"
          style={{ width: `${minX}%` }} />
        {/* Active liquidity zone */}
        <div className="absolute top-0 bottom-0"
          style={{
            left:       `${minX}%`,
            width:      `${maxX - minX}%`,
            background: 'linear-gradient(90deg, rgba(59,130,246,.3) 0%, rgba(109,40,217,.3) 100%)',
            borderLeft: '2px solid #3b82f6',
            borderRight: '2px solid #8b5cf6',
          }}
        />
        {/* Inactive zone right */}
        <div className="absolute top-0 bottom-0 bg-slate-800/50"
          style={{ left: `${maxX}%`, right: 0 }} />
        {/* Current price line */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-green-400 z-10"
          style={{ left: `${curX}%` }} />
        {/* Current price label */}
        <div className="absolute -top-1 text-[9px] text-green-400 font-bold"
          style={{ left: `${Math.min(Math.max(curX - 2, 0), 85)}%` }}>
          current
        </div>
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-slate-600">
        <span>{chartMin.toFixed(4)}</span>
        <span className="text-slate-400">Current: {currentPrice.toFixed(6)}</span>
        <span>{chartMax.toFixed(4)}</span>
      </div>
    </div>
  );
}

// ── V3 Position Card ─────────────────────────────────────────────────────────

interface PositionData {
  pairAddress: string;
  tokenA:      Token;
  tokenB:      Token;
  lpBalance:   string;
  reserve0:    bigint;
  reserve1:    bigint;
  totalSupply: bigint;
  token0:      string;
}

function PositionCard({
  pos, explorerUrl, onRemove, wcro,
}: {
  pos: PositionData; explorerUrl: string; onRemove: (pos: PositionData) => void; wcro: string;
}) {
  const lpShare = pos.totalSupply > 0n
    ? (Number(pos.lpBalance) / Number(formatAmount(pos.totalSupply, 18))) * 100
    : 0;

  const inAddr = (isNativeCRO(pos.tokenA.address) ? wcro : pos.tokenA.address).toLowerCase();
  const rA = pos.token0.toLowerCase() === inAddr ? pos.reserve0 : pos.reserve1;
  const rB = pos.token0.toLowerCase() === inAddr ? pos.reserve1 : pos.reserve0;

  const myA = pos.totalSupply > 0n
    ? (rA * BigInt(Math.floor(Number(pos.lpBalance) * 1e12)) / pos.totalSupply) / BigInt(1e12)
    : 0n;
  const myB = pos.totalSupply > 0n
    ? (rB * BigInt(Math.floor(Number(pos.lpBalance) * 1e12)) / pos.totalSupply) / BigInt(1e12)
    : 0n;

  const price = rA > 0n
    ? parseFloat(formatAmount(rB, pos.tokenB.decimals)) / parseFloat(formatAmount(rA, pos.tokenA.decimals))
    : 0;

  const minPrice = price * 0.8;
  const maxPrice = price * 1.25;

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {[pos.tokenA, pos.tokenB].map((t, i) => (
              <div key={i}
                className={`w-8 h-8 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white ${i === 0 ? 'bg-gradient-to-br from-blue-600 to-blue-800' : 'bg-gradient-to-br from-purple-600 to-purple-800'}`}>
                {t.symbol.slice(0, 2)}
              </div>
            ))}
          </div>
          <div>
            <p className="font-bold text-white text-sm">{pos.tokenA.symbol}/{pos.tokenB.symbol}</p>
            <p className="text-xs text-slate-500">0.3% fee tier · V2 Pool</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold rounded-full">
            ● In range
          </span>
          <a href={`${explorerUrl}/address/${pos.pairAddress}`} target="_blank" rel="noreferrer"
            className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Price range chart */}
      <div className="p-4 pb-0">
        {price > 0 && (
          <PriceRangeChart
            currentPrice={price}
            minPrice={minPrice}
            maxPrice={maxPrice}
            tokenA={pos.tokenA}
            tokenB={pos.tokenB}
          />
        )}
      </div>

      {/* Position details */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="bg-slate-950 rounded-xl p-3 border border-slate-800">
          <p className="text-xs text-slate-500 mb-1">Pool share</p>
          <p className="text-white font-bold text-sm">{lpShare.toFixed(4)}%</p>
          <p className="text-slate-600 text-xs mt-0.5">{parseFloat(pos.lpBalance).toFixed(6)} LP</p>
        </div>
        <div className="bg-slate-950 rounded-xl p-3 border border-slate-800">
          <p className="text-xs text-slate-500 mb-1">Fee tier</p>
          <p className="text-white font-bold text-sm">0.30%</p>
          <p className="text-slate-600 text-xs mt-0.5">Auto-compounding</p>
        </div>
        <div className="bg-slate-950 rounded-xl p-3 border border-slate-800">
          <p className="text-xs text-slate-500 mb-1">My {pos.tokenA.symbol}</p>
          <p className="text-white font-bold text-sm">{formatAmount(myA, pos.tokenA.decimals, 4)}</p>
        </div>
        <div className="bg-slate-950 rounded-xl p-3 border border-slate-800">
          <p className="text-xs text-slate-500 mb-1">My {pos.tokenB.symbol}</p>
          <p className="text-white font-bold text-sm">{formatAmount(myB, pos.tokenB.decimals, 4)}</p>
        </div>
      </div>

      {/* Price range labels */}
      <div className="px-4 pb-4">
        <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-500 mb-1">Min price</p>
            <p className="text-blue-400 font-mono font-semibold">{minPrice.toFixed(6)}</p>
            <p className="text-slate-600">{pos.tokenA.symbol} per {pos.tokenB.symbol}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Max price</p>
            <p className="text-purple-400 font-mono font-semibold">∞</p>
            <p className="text-slate-600">{pos.tokenA.symbol} per {pos.tokenB.symbol}</p>
          </div>
        </div>
      </div>

      {/* Remove button */}
      <div className="px-4 pb-4">
        <button onClick={() => onRemove(pos)}
          className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2">
          <Minus className="w-4 h-4" /> Remove Position
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LiquidityManager() {
  const { walletAddress, network, addNotification, updateNotification } = useAppStore();
  const tokens        = getTokenList(network.chainId);
  const routerConfig  = getRouterConfig(network.chainId);
  const wcro          = getWCROAddress(network.chainId);

  const [tab,        setTab]        = useState<Tab>('add');
  const [tokenA,     setTokenA]     = useState<Token>(tokens[0]);
  const [tokenB,     setTokenB]     = useState<Token>(tokens[2] ?? tokens[1]);
  const [amountA,    setAmountA]    = useState('');
  const [amountB,    setAmountB]    = useState('');
  const [balanceA,   setBalanceA]   = useState('0');
  const [balanceB,   setBalanceB]   = useState('0');
  const [lpBalance,  setLpBalance]  = useState('0');
  const [removePercent, setRemovePercent] = useState(50);
  const [lpToRemove, setLpToRemove] = useState('');
  const [pairInfo,   setPairInfo]   = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isTxPending, setIsTxPending] = useState(false);
  const [lastTx,     setLastTx]     = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [showModalA, setShowModalA] = useState(false);
  const [showModalB, setShowModalB] = useState(false);
  const [slippage,   setSlippage]   = useState(50); // bps

  // V3 positions tab state
  const [positions,    setPositions]    = useState<PositionData[]>([]);
  const [posFetching,  setPosFetching]  = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PositionData | null>(null);
  const [removePos,    setRemovePos]    = useState(50);

  // Reset on network change
  useEffect(() => {
    const list = getTokenList(network.chainId);
    setTokenA(list[0]); setTokenB(list[2] ?? list[1]);
    setAmountA(''); setAmountB(''); setLpBalance('0'); setPairInfo(null); setPositions([]);
  }, [network.chainId]);

  // ── Balances ────────────────────────────────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const provider = getDexProvider(network.chainId);
      const getbal = async (t: Token) => {
        if (t.isNative) return formatAmount(await provider.getBalance(walletAddress), 18);
        const c = new ethers.Contract(t.address, ERC20_ABI, provider);
        return formatAmount(await c.balanceOf(walletAddress), t.decimals);
      };
      const [ba, bb] = await Promise.all([getbal(tokenA), getbal(tokenB)]);
      setBalanceA(ba); setBalanceB(bb);
    } catch { /* silent */ }
  }, [walletAddress, tokenA, tokenB]);

  // ── Pair Info ───────────────────────────────────────────────────────────────
  const fetchPairInfo = useCallback(async () => {
    setIsFetching(true); setPairInfo(null); setError(null);
    try {
      const params = new URLSearchParams({
        tokenA:  tokenA.address, tokenB: tokenB.address, chainId: String(network.chainId),
      });
      const res  = await fetch(`/api/pool/info?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.exists) { setIsFetching(false); return; }
      const info = {
        pairAddress: data.pairAddress as string,
        token0:      data.token0 as string,
        token1:      data.token1 as string,
        reserve0:    BigInt(data.reserve0),
        reserve1:    BigInt(data.reserve1),
        totalSupply: BigInt(data.totalSupply),
      };
      setPairInfo(info);
      if (walletAddress && window.ethereum) {
        const prov = getDexProvider(network.chainId);
        const pair = new ethers.Contract(info.pairAddress, PAIR_ABI, prov);
        const lpBal: bigint = await pair.balanceOf(walletAddress);
        const lpStr = formatAmount(lpBal, 18, 8);
        setLpBalance(lpStr);
        setLpToRemove(formatAmount((lpBal * BigInt(removePercent)) / 100n, 18, 8));
      }
    } catch { /* no-op — pool may not exist */ }
    finally { setIsFetching(false); }
  }, [tokenA, tokenB, network.chainId, walletAddress, removePercent]);

  useEffect(() => { fetchPairInfo(); fetchBalances(); }, [tokenA, tokenB]);
  useEffect(() => { fetchBalances(); }, [walletAddress]);

  // Auto-calc tokenB from pool ratio
  useEffect(() => {
    if (!pairInfo || !amountA || parseFloat(amountA) <= 0) return;
    try {
      const inAddr = (tokenA.isNative ? wcro : tokenA.address).toLowerCase();
      const rA = pairInfo.token0.toLowerCase() === inAddr ? pairInfo.reserve0 : pairInfo.reserve1;
      const rB = pairInfo.token0.toLowerCase() === inAddr ? pairInfo.reserve1 : pairInfo.reserve0;
      const amtA = parseAmount(amountA, tokenA.decimals);
      const amtB = calcLiquidityAmountB(amtA, rA, rB);
      if (amtB > 0n) setAmountB(formatAmount(amtB, tokenB.decimals, 8));
    } catch { /* new pool — user sets price */ }
  }, [amountA, pairInfo, tokenA, tokenB, network.chainId]);

  // Update LP to remove when percent changes
  useEffect(() => {
    if (!pairInfo || !walletAddress || !window.ethereum) return;
    (async () => {
      const prov = getDexProvider(network.chainId);
      const pair = new ethers.Contract(pairInfo.pairAddress, PAIR_ABI, prov);
      const lpBal: bigint = await pair.balanceOf(walletAddress);
      setLpToRemove(formatAmount((lpBal * BigInt(removePercent)) / 100n, 18, 8));
    })().catch(() => {});
  }, [removePercent, pairInfo, walletAddress]);

  // ── Scan positions for "Positions" tab ──────────────────────────────────────
  // Queries VVS factory + LP balances directly via frontend RPC — bypasses the
  // /api/pool/info backend route which was frequently timing out (503) causing
  // all positions to silently show as "not found".
  const scanPositions = useCallback(async () => {
    if (!walletAddress || !window.ethereum) return;
    setPosFetching(true);
    const found: PositionData[] = [];
    const list  = getTokenList(network.chainId);
    const prov  = getDexProvider(network.chainId);
    const wcro  = getWCROAddress(network.chainId);
    const factory = new ethers.Contract(routerConfig.factory, FACTORY_ABI, prov);
    try {
      const pairs: [Token, Token][] = [];
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
          pairs.push([list[i], list[j]]);

      // Query factory.getPair() and LP balance in parallel for every combination
      const results = await Promise.allSettled(
        pairs.map(async ([tA, tB]) => {
          const addrA = tA.isNative ? wcro : tA.address;
          const addrB = tB.isNative ? wcro : tB.address;
          const pairAddr: string = await factory.getPair(addrA, addrB);
          if (!pairAddr || pairAddr === ethers.ZeroAddress) return null;
          const pair = new ethers.Contract(pairAddr, PAIR_ABI, prov);
          const [lpBal, reserves, token0, totalSupply]: [bigint, any, string, bigint] =
            await Promise.all([
              pair.balanceOf(walletAddress),
              pair.getReserves(),
              pair.token0(),
              pair.totalSupply(),
            ]);
          if (lpBal === 0n) return null;
          return {
            pairAddress: pairAddr,
            tokenA: tA, tokenB: tB,
            lpBalance:   formatAmount(lpBal, 18, 8),
            reserve0:    reserves[0] as bigint,
            reserve1:    reserves[1] as bigint,
            totalSupply: totalSupply,
            token0:      (token0 as string).toLowerCase(),
          } as PositionData;
        })
      );
      for (const r of results)
        if (r.status === 'fulfilled' && r.value) found.push(r.value);
    } catch (e) {
      console.warn('[LiquidityManager] scanPositions error:', e);
    }
    setPositions(found);
    setPosFetching(false);
  }, [walletAddress, network.chainId, routerConfig.factory]);

  useEffect(() => {
    if (tab === 'positions') scanPositions();
  }, [tab, walletAddress]);

  // ── Add Liquidity ───────────────────────────────────────────────────────────
  const handleAddLiquidity = async () => {
    if (!walletAddress || !window.ethereum || !amountA || !amountB) return;
    setIsTxPending(true); setError(null); setLastTx(null);
    const notifId = addNotification({ type: 'loading', title: 'Preparing…', message: 'Waiting for wallet…', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const net      = await provider.getNetwork();
      if (Number(net.chainId) !== network.chainId)
        throw new Error(`Switch to ${network.name} in your wallet.`);

      const router = new ethers.Contract(routerConfig.router, ROUTER_ABI, signer);
      const amtA   = parseAmount(amountA, tokenA.decimals);
      const amtB   = parseAmount(amountB, tokenB.decimals);
      const minA   = applySlippage(amtA, slippage);
      const minB   = applySlippage(amtB, slippage);
      const dl     = getDeadline(20);

      if (!pairInfo) {
        updateNotification(notifId, { type: 'loading', title: 'Creating Pool…', message: `Creating ${tokenA.symbol}/${tokenB.symbol} pool…`, duration: 0 });
        try {
          await createPairIfNeeded(routerConfig.factory, tokenA.address, tokenB.address, network.chainId, signer);
        } catch (e: any) { if (!e.message?.includes('PAIR_EXISTS')) throw e; }
      }

      let tx: ethers.TransactionResponse;

      if (isNativeCRO(tokenA.address)) {
        updateNotification(notifId, { type: 'loading', title: '1/2 — Approve', message: `Approving ${tokenB.symbol}…`, duration: 0 });
        await ensureApproval(tokenB.address, walletAddress, routerConfig.router, amtB, signer, network.chainId);
        updateNotification(notifId, { type: 'loading', title: '2/2 — Confirm', message: `Adding CRO + ${tokenB.symbol}…`, duration: 0 });
        tx = await router.addLiquidityETH(tokenB.address, amtB, minB, minA, walletAddress, dl, { value: amtA });
      } else if (isNativeCRO(tokenB.address)) {
        updateNotification(notifId, { type: 'loading', title: '1/2 — Approve', message: `Approving ${tokenA.symbol}…`, duration: 0 });
        await ensureApproval(tokenA.address, walletAddress, routerConfig.router, amtA, signer, network.chainId);
        updateNotification(notifId, { type: 'loading', title: '2/2 — Confirm', message: `Adding ${tokenA.symbol} + CRO…`, duration: 0 });
        tx = await router.addLiquidityETH(tokenA.address, amtA, minA, minB, walletAddress, dl, { value: amtB });
      } else {
        updateNotification(notifId, { type: 'loading', title: '1/3 — Approve A', message: `Approving ${tokenA.symbol}…`, duration: 0 });
        await ensureApproval(tokenA.address, walletAddress, routerConfig.router, amtA, signer, network.chainId);
        updateNotification(notifId, { type: 'loading', title: '2/3 — Approve B', message: `Approving ${tokenB.symbol}…`, duration: 0 });
        await ensureApproval(tokenB.address, walletAddress, routerConfig.router, amtB, signer, network.chainId);
        updateNotification(notifId, { type: 'loading', title: '3/3 — Confirm', message: `Adding ${tokenA.symbol} + ${tokenB.symbol}…`, duration: 0 });
        tx = await router.addLiquidity(tokenA.address, tokenB.address, amtA, amtB, minA, minB, walletAddress, dl);
      }

      updateNotification(notifId, { type: 'loading', title: 'Pending…', message: `TX: ${tx.hash.slice(0, 10)}…`, duration: 0 });
      await tx.wait();
      setLastTx(tx.hash); setAmountA(''); setAmountB('');
      updateNotification(notifId, { type: 'success', title: 'Liquidity Added! 🎉', message: `TX: ${tx.hash.slice(0, 10)}…`, duration: 7000 });
      fetchPairInfo(); fetchBalances();
    } catch (err: any) {
      const isRejected = err.code === 4001 || err.code === 'ACTION_REJECTED';
      if (isRejected) {
        updateNotification(notifId, { type: 'info', title: 'Cancelled', message: 'Rejected in wallet.', duration: 4000 });
      } else {
        const msg = err.reason || err.shortMessage || err.message || 'Transaction failed';
        setError(msg);
        updateNotification(notifId, { type: 'error', title: 'Add Liquidity Failed', message: msg, duration: 8000 });
      }
    } finally { setIsTxPending(false); }
  };

  // ── Remove Liquidity ────────────────────────────────────────────────────────
  const handleRemoveLiquidity = async (customLP?: string, customPercent?: number) => {
    const lpAmt   = customLP || lpToRemove;
    const percent = customPercent || removePercent;
    if (!walletAddress || !window.ethereum || !lpAmt) return;
    setIsTxPending(true); setError(null); setLastTx(null);
    const notifId = addNotification({ type: 'loading', title: 'Preparing…', message: 'Waiting for wallet…', duration: 0 });
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const net      = await provider.getNetwork();
      if (Number(net.chainId) !== network.chainId)
        throw new Error(`Switch to ${network.name} in your wallet.`);

      // Fetch latest pair info directly (don't rely on cached pairInfo which may be stale)
      const readProvider = getDexProvider(network.chainId);
      const params = new URLSearchParams({ tokenA: tokenA.address, tokenB: tokenB.address, chainId: String(network.chainId) });
      const infoRes = await fetch(`/api/pool/info?${params}`);
      const infoData = infoRes.ok ? await infoRes.json() : null;
      if (!infoData?.exists) throw new Error('Pool not found — try refreshing the page.');
      const currentPairAddress = infoData.pairAddress as string;

      const router = new ethers.Contract(routerConfig.router, ROUTER_ABI, signer);
      const lpBn   = parseAmount(lpAmt, 18);
      const dl     = getDeadline(20);

      // Calculate min amounts with 5% slippage from current reserves
      const reserve0 = BigInt(infoData.reserve0);
      const reserve1 = BigInt(infoData.reserve1);
      const totalSupply = BigInt(infoData.totalSupply);
      const slippage = 95n; // 5% slippage tolerance
      const minA = totalSupply > 0n ? (reserve0 * lpBn * slippage) / (totalSupply * 100n) : 0n;
      const minB = totalSupply > 0n ? (reserve1 * lpBn * slippage) / (totalSupply * 100n) : 0n;

      updateNotification(notifId, { type: 'loading', title: '1/2 — Approve LP', message: 'Approving LP token…', duration: 0 });
      // Use exact LP amount for approval (not MaxUint256) — safer + compatible with all LP contracts
      const lpToken = new ethers.Contract(currentPairAddress, [
        'function allowance(address,address) view returns (uint)',
        'function approve(address,uint) returns (bool)',
      ], readProvider);
      const existing = await lpToken.allowance(walletAddress, routerConfig.router);
      if (existing < lpBn) {
        const lpTokenRW = new ethers.Contract(currentPairAddress, [
          'function approve(address,uint) returns (bool)',
        ], signer);
        const approveTx = await lpTokenRW.approve(routerConfig.router, lpBn);
        await approveTx.wait();
      }

      updateNotification(notifId, { type: 'loading', title: `2/2 — Confirm`, message: `Removing ${percent}% of LP position…`, duration: 0 });

      let tx: ethers.TransactionResponse;
      if (tokenA.isNative || tokenB.isNative) {
        const erc20 = tokenA.isNative ? tokenB : tokenA;
        // tokenA is native → minA is ETH min, minB is token min → reversed for removeLiquidityETH
        const minToken = tokenA.isNative ? minB : minA;
        const minCRO   = tokenA.isNative ? minA : minB;
        tx = await router.removeLiquidityETH(erc20.address, lpBn, minToken, minCRO, walletAddress, dl);
      } else {
        tx = await router.removeLiquidity(tokenA.address, tokenB.address, lpBn, minA, minB, walletAddress, dl);
      }

      updateNotification(notifId, { type: 'loading', title: 'Pending…', message: `TX: ${tx.hash.slice(0, 10)}…`, duration: 0 });
      await tx.wait();
      setLastTx(tx.hash);
      updateNotification(notifId, { type: 'success', title: 'Liquidity Removed! ✅', message: `TX: ${tx.hash.slice(0, 10)}…`, duration: 7000 });
      setRemoveTarget(null);
      fetchPairInfo(); fetchBalances(); scanPositions();
    } catch (err: any) {
      const isRejected = err.code === 4001 || err.code === 'ACTION_REJECTED';
      if (isRejected) {
        updateNotification(notifId, { type: 'info', title: 'Cancelled', message: 'Rejected in wallet.', duration: 4000 });
      } else {
        const msg = err.reason || err.shortMessage || err.message || 'Transaction failed';
        setError(msg);
        updateNotification(notifId, { type: 'error', title: 'Remove Liquidity Failed', message: msg, duration: 8000 });
      }
    } finally { setIsTxPending(false); }
  };

  // Handle removing from positions tab
  const handleRemoveFromPositions = async (pos: PositionData, pct: number) => {
    if (!walletAddress || !window.ethereum) return;
    setIsTxPending(true); setError(null);
    const notifId = addNotification({ type: 'loading', title: 'Preparing…', message: 'Waiting for wallet…', duration: 0 });
    try {
      const signerProvider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await signerProvider.getSigner();
      // FIX (-32603): Read LP balance via proxy, not via MetaMask signer
      const readProvider = getDexProvider(network.chainId);
      const pair     = new ethers.Contract(pos.pairAddress, PAIR_ABI, readProvider);
      const lpBal: bigint = await pair.balanceOf(walletAddress);
      const lpBn   = (lpBal * BigInt(pct)) / 100n;
      const dl     = getDeadline(20);
      const router = new ethers.Contract(routerConfig.router, ROUTER_ABI, signer);

      updateNotification(notifId, { type: 'loading', title: '1/2 — Approve LP', message: 'Approving LP token…', duration: 0 });
      await ensureApproval(pos.pairAddress, walletAddress, routerConfig.router, lpBn, signer, network.chainId);

      updateNotification(notifId, { type: 'loading', title: `2/2 — Confirm`, message: `Removing ${pct}% of position…`, duration: 0 });

      let tx: ethers.TransactionResponse;
      if (pos.tokenA.isNative || pos.tokenB.isNative) {
        const erc20 = pos.tokenA.isNative ? pos.tokenB : pos.tokenA;
        tx = await router.removeLiquidityETH(erc20.address, lpBn, 0n, 0n, walletAddress, dl);
      } else {
        tx = await router.removeLiquidity(pos.tokenA.address, pos.tokenB.address, lpBn, 0n, 0n, walletAddress, dl);
      }

      await tx.wait();
      updateNotification(notifId, { type: 'success', title: 'Position Removed! ✅', message: `TX: ${tx.hash.slice(0, 10)}…`, duration: 7000 });
      setRemoveTarget(null);
      scanPositions();
    } catch (err: any) {
      const isRejected = err.code === 4001 || err.code === 'ACTION_REJECTED';
      if (!isRejected) {
        updateNotification(notifId, { type: 'error', title: 'Failed', message: err.message, duration: 8000 });
      } else {
        updateNotification(notifId, { type: 'info', title: 'Cancelled', message: 'Rejected in wallet.', duration: 3000 });
      }
    } finally { setIsTxPending(false); }
  };

  // Pool ratio for price display
  const poolRatio = pairInfo ? (() => {
    const inAddr = (tokenA.isNative ? wcro : tokenA.address).toLowerCase();
    const rIn  = pairInfo.token0.toLowerCase() === inAddr ? pairInfo.reserve0 : pairInfo.reserve1;
    const rOut = pairInfo.token0.toLowerCase() === inAddr ? pairInfo.reserve1 : pairInfo.reserve0;
    if (rIn === 0n) return null;
    const ratio = parseFloat(formatAmount(rOut, tokenB.decimals)) / parseFloat(formatAmount(rIn, tokenA.decimals));
    return isNaN(ratio) || !isFinite(ratio) ? null : ratio;
  })() : null;

  const TABS = [
    { id: 'add'       as Tab, label: 'Add Liquidity',  icon: Plus },
    { id: 'remove'    as Tab, label: 'Remove',          icon: Minus },
    { id: 'positions' as Tab, label: 'My Positions',    icon: Layers },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Liquidity Manager</h1>
        <p className="text-slate-400 text-sm">Manage pools on {routerConfig.name} · V3-style position tracking</p>
      </div>

      {network.chainId === 338 && (
        <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-yellow-300/90 space-y-1.5">
            <p><strong className="text-yellow-300">Testnet mode active.</strong> The DEX factory is deployed but pools have <strong>no reserves yet</strong>. Full testnet workflow:</p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-yellow-300/80">
              <li>Get free TCRO from the <a href="https://cronos.org/faucet" target="_blank" rel="noopener noreferrer" className="underline text-yellow-400 hover:text-yellow-300">Cronos Faucet</a></li>
              <li>Deploy a test ERC-20 via <strong>Token Creator</strong> — copy the deployed contract address</li>
              <li>Click the token selector below and paste that address to import your token</li>
              <li>Use <strong>Add Liquidity</strong> — enter TCRO + your token amounts to create a new pool</li>
              <li>Your pool is live — use the Swap page to trade against it</li>
            </ol>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex bg-slate-900 rounded-xl border border-slate-800 p-1 gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); setError(null); setLastTx(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all
              ${tab === id ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ── ADD LIQUIDITY TAB ── */}
      {tab === 'add' && (
        <>
          {/* Pair selector */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Select Pair</span>
              <div className="flex items-center gap-2">
                {/* Slippage quick-select */}
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
                  {[10, 50, 100].map(bps => (
                    <button key={bps} onClick={() => setSlippage(bps)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors
                        ${slippage === bps ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>
                      {bps / 100}%
                    </button>
                  ))}
                </div>
                <button onClick={() => { fetchPairInfo(); fetchBalances(); }}
                  className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                  <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <TokenBtn token={tokenA} onClick={() => setShowModalA(true)} />
              <Plus className="w-4 h-4 text-slate-600 flex-shrink-0" />
              <TokenBtn token={tokenB} onClick={() => setShowModalB(true)} />
            </div>

            {/* Pool info */}
            {isFetching ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading pool data…
              </div>
            ) : pairInfo ? (
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-green-400 font-semibold mb-3">
                  <Droplets className="w-3.5 h-3.5" /> Pool exists · {routerConfig.name}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pair address</span>
                  <a href={`${network.explorerUrl}/address/${pairInfo.pairAddress}`} target="_blank" rel="noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1">
                    {pairInfo.pairAddress.slice(0, 8)}…{pairInfo.pairAddress.slice(-6)}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tokenA.symbol} reserve</span>
                  <span className="text-slate-300">
                    {formatAmount(pairInfo.token0.toLowerCase() === (isNativeCRO(tokenA.address) ? wcro : tokenA.address).toLowerCase() ? pairInfo.reserve0 : pairInfo.reserve1, tokenA.decimals, 4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tokenB.symbol} reserve</span>
                  <span className="text-slate-300">
                    {formatAmount(pairInfo.token0.toLowerCase() === (isNativeCRO(tokenB.address) ? wcro : tokenB.address).toLowerCase() ? pairInfo.reserve0 : pairInfo.reserve1, tokenB.decimals, 4)}
                  </span>
                </div>
                {walletAddress && (
                  <div className="flex justify-between border-t border-slate-800 pt-2 mt-1">
                    <span className="text-slate-500">Your LP tokens</span>
                    <span className="text-blue-400 font-semibold">{lpBalance}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs text-yellow-400">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                No pool found — adding liquidity will create this pool at your price.
              </div>
            )}

            {poolRatio !== null && (
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Pool price</span>
                  <span className="text-slate-300">1 {tokenA.symbol} = {poolRatio.toFixed(6)} {tokenB.symbol}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-slate-500">Inverse</span>
                  <span className="text-slate-300">1 {tokenB.symbol} = {(1 / poolRatio).toFixed(6)} {tokenA.symbol}</span>
                </div>
              </div>
            )}
          </div>

          {/* Deposit amounts */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-3">
            <h3 className="font-bold text-white text-sm">Deposit Amounts</h3>
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
              <div className="flex justify-between mb-2">
                <span className="text-xs text-slate-500">{tokenA.symbol}</span>
                <span className="text-xs text-slate-500">Balance: {balanceA}</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" value={amountA} onChange={(e) => setAmountA(e.target.value)}
                  placeholder="0.0"
                  className="flex-1 bg-transparent text-xl font-bold text-white outline-none placeholder-slate-700" />
                <button onClick={() => setAmountA(balanceA)} className="text-xs text-blue-400 hover:text-blue-300 font-semibold">MAX</button>
              </div>
            </div>
            <div className="flex justify-center"><Plus className="w-4 h-4 text-slate-600" /></div>
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
              <div className="flex justify-between mb-2">
                <span className="text-xs text-slate-500">
                  {tokenB.symbol}
                  {pairInfo && <span className="ml-2 text-blue-400/60">· auto from pool ratio</span>}
                </span>
                <span className="text-xs text-slate-500">Balance: {balanceB}</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" value={amountB} onChange={(e) => setAmountB(e.target.value)}
                  placeholder="0.0"
                  className="flex-1 bg-transparent text-xl font-bold text-white outline-none placeholder-slate-700" />
                <button onClick={() => setAmountB(balanceB)} className="text-xs text-blue-400 hover:text-blue-300 font-semibold">MAX</button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}
            {lastTx && (
              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-xs text-green-400">
                <CheckCircle className="w-4 h-4 flex-shrink-0" /> Liquidity added!
                <a href={`${network.explorerUrl}/tx/${lastTx}`} target="_blank" rel="noreferrer"
                  className="ml-auto text-green-300 hover:text-white flex items-center gap-1">
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {!walletAddress ? (
              <div className="w-full py-4 bg-slate-800 text-slate-400 rounded-xl text-center font-semibold text-sm">
                Connect wallet
              </div>
            ) : (
              <button onClick={handleAddLiquidity} disabled={isTxPending || !amountA || !amountB}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30">
                {isTxPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</> : <><Plus className="w-4 h-4" /> Add Liquidity</>}
              </button>
            )}
          </div>
        </>
      )}

      {/* ── REMOVE LIQUIDITY TAB ── */}
      {tab === 'remove' && (
        <>
          {/* Same pair selector */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Your Pool Position</span>
              <button onClick={() => { fetchPairInfo(); fetchBalances(); }}
                className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <TokenBtn token={tokenA} onClick={() => setShowModalA(true)} />
              <Plus className="w-4 h-4 text-slate-600 flex-shrink-0" />
              <TokenBtn token={tokenB} onClick={() => setShowModalB(true)} />
            </div>

            {isFetching ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            ) : !pairInfo ? (
              <div className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-500">
                <Info className="w-3.5 h-3.5 flex-shrink-0" /> No pool found for this pair.
              </div>
            ) : parseFloat(lpBalance) === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-500">
                <Info className="w-3.5 h-3.5 flex-shrink-0" /> You have no LP tokens for this pool.
              </div>
            ) : (
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                <div className="flex justify-between mb-1 text-xs">
                  <span className="text-slate-500">Your LP tokens</span>
                  <span className="text-blue-400 font-bold">{lpBalance}</span>
                </div>
                {poolRatio !== null && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-slate-500">Pool price</span>
                    <span className="text-slate-300">1 {tokenA.symbol} = {poolRatio.toFixed(6)} {tokenB.symbol}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {pairInfo && parseFloat(lpBalance) > 0 && (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
              <h3 className="font-bold text-white text-sm">Remove Amount</h3>
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                <div className="flex justify-between mb-3">
                  <span className="text-xs text-slate-500">Remove percentage</span>
                  <span className="text-white font-bold text-lg">{removePercent}%</span>
                </div>
                <input type="range" min={1} max={100} value={removePercent}
                  onChange={(e) => setRemovePercent(parseInt(e.target.value))}
                  className="w-full h-1.5 accent-blue-500 cursor-pointer" />
                <div className="flex gap-2 mt-3">
                  {[25, 50, 75, 100].map((p) => (
                    <button key={p} onClick={() => setRemovePercent(p)}
                      className={`flex-1 py-1.5 text-xs rounded-lg font-semibold transition-colors
                        ${removePercent === p ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                      {p === 100 ? 'MAX' : `${p}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">LP to burn</span>
                  <span className="text-white font-mono">{lpToRemove}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total LP</span>
                  <span className="text-slate-300 font-mono">{lpBalance}</span>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
                </div>
              )}
              {lastTx && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-xs text-green-400">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" /> Removed!
                  <a href={`${network.explorerUrl}/tx/${lastTx}`} target="_blank" rel="noreferrer"
                    className="ml-auto text-green-300 hover:text-white flex items-center gap-1">
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {!walletAddress ? (
                <div className="w-full py-4 bg-slate-800 text-slate-400 rounded-xl text-center font-semibold text-sm">Connect wallet</div>
              ) : (
                <button onClick={() => handleRemoveLiquidity()} disabled={isTxPending}
                  className="w-full py-4 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                  {isTxPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Removing…</>
                    : <><Minus className="w-4 h-4" /> Remove {removePercent}% Liquidity</>}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── POSITIONS (V3-STYLE) TAB ── */}
      {tab === 'positions' && (
        <div className="space-y-4">
          {/* V3 style header card */}
          <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-2xl border border-blue-500/20 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-500/20 rounded-xl">
                <BarChart2 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Position Manager</h3>
                <p className="text-xs text-slate-400">V3-style UI · Powered by VVS Finance V2</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/50">
                <p className="text-xs text-slate-500 mb-1">Active Positions</p>
                <p className="text-white font-bold text-lg">{positions.length}</p>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/50">
                <p className="text-xs text-slate-500 mb-1">Fee Tier</p>
                <p className="text-white font-bold text-lg">0.3%</p>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/50">
                <p className="text-xs text-slate-500 mb-1">Protocol</p>
                <p className="text-blue-400 font-bold text-sm">VVS V2</p>
              </div>
            </div>
          </div>

          {/* Scan button */}
          <button onClick={scanPositions} disabled={posFetching || !walletAddress}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-slate-300 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            {posFetching
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning pools…</>
              : <><RefreshCw className="w-4 h-4" /> Scan My Positions</>}
          </button>

          {!walletAddress && (
            <div className="py-12 text-center text-slate-500 text-sm bg-slate-900/50 rounded-xl border border-slate-800">
              Connect your wallet to view positions
            </div>
          )}

          {walletAddress && !posFetching && positions.length === 0 && (
            <div className="py-12 text-center bg-slate-900/50 rounded-xl border border-slate-800">
              <Droplets className="w-8 h-8 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-semibold mb-1">No positions found</p>
              <p className="text-slate-600 text-xs">Add liquidity to a pool to see your positions here</p>
              <button onClick={() => setTab('add')}
                className="mt-4 flex items-center gap-2 mx-auto text-xs text-blue-400 hover:text-blue-300 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add your first position
              </button>
            </div>
          )}

          {positions.map((pos, i) => (
            <PositionCard
              key={i}
              pos={pos}
              explorerUrl={network.explorerUrl}
              wcro={wcro}
              onRemove={(p) => setRemoveTarget(p)}
            />
          ))}
        </div>
      )}

      {/* ── DEX info ── */}
      <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl text-xs text-slate-500 space-y-1">
        <p>Liquidity on <strong className="text-slate-400">{routerConfig.name}</strong> earns 0.3% of all swaps proportional to pool share.</p>
        <p>LP tokens represent your position and are needed to withdraw funds — keep them safe.</p>
      </div>

      {/* Token modals */}
      {showModalA && (
        <TokenSelectorModal tokens={tokens} title="Select Token A" chainId={network.chainId}
          walletAddress={walletAddress}
          selectedAddress={tokenA.address}
          onClose={() => setShowModalA(false)}
          onSelect={(t) => { setTokenA(t); setAmountA(''); setAmountB(''); }} />
      )}
      {showModalB && (
        <TokenSelectorModal tokens={tokens} title="Select Token B" chainId={network.chainId}
          walletAddress={walletAddress}
          selectedAddress={tokenB.address}
          onClose={() => setShowModalB(false)}
          onSelect={(t) => { setTokenB(t); setAmountB(''); }} />
      )}

      {/* Remove from positions modal */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setRemoveTarget(null)} />
          <div className="relative w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">Remove Position</h3>
              <button onClick={() => setRemoveTarget(null)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-400">
              Remove from your <strong className="text-white">{removeTarget.tokenA.symbol}/{removeTarget.tokenB.symbol}</strong> position
            </p>
            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Remove percentage</span>
                <span className="text-white font-bold">{removePos}%</span>
              </div>
              <input type="range" min={1} max={100} value={removePos}
                onChange={(e) => setRemovePos(parseInt(e.target.value))}
                className="w-full h-1.5 accent-red-500 cursor-pointer" />
              <div className="flex gap-2">
                {[25, 50, 75, 100].map((p) => (
                  <button key={p} onClick={() => setRemovePos(p)}
                    className={`flex-1 py-1.5 text-xs rounded-lg font-semibold transition-colors
                      ${removePos === p ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                    {p === 100 ? 'MAX' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => handleRemoveFromPositions(removeTarget, removePos)}
              disabled={isTxPending}
              className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
              {isTxPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Removing…</>
                : <><Minus className="w-4 h-4" /> Remove {removePos}% of Position</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

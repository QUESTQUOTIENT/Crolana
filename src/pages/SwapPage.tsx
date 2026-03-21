import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { getDexProvider } from '../lib/provider';
import { ArrowDownUp, Settings, Loader2, ChevronDown, AlertTriangle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store';
import { isSolanaNetwork } from '../types';
import { SolanaSwap } from './SolanaSwap';
import { getTokenList, getRouterConfig, getWCROAddress, NATIVE_CRO_ADDRESS, type Token } from '../data/tokens';
import { TokenSelectorModal } from '../components/TokenSelectorModal';
import {
  ROUTER_ABI, ERC20_ABI, isNativeCRO, buildSwapPath,
  parseAmount, formatAmount, applySlippage, getDeadline,
  ensureApproval, calcPriceImpact, getSwapQuote,
} from '../lib/dex';

// ── Main Swap Page ──────────────────────────────────────────────────────────
export function SwapPage() {
  const _networkCheck = useAppStore(s => s.network);
  if (isSolanaNetwork(_networkCheck)) return <SolanaSwap />;
  return <_SwapPageEvm />;
}

function _SwapPageEvm() {
  const { walletAddress, network, addNotification, updateNotification } = useAppStore();
  const tokens = getTokenList(network.chainId);
  const routerConfig = getRouterConfig(network.chainId);

  const [tokenIn, setTokenIn] = useState<Token>(tokens[0]);
  const [tokenOut, setTokenOut] = useState<Token>(tokens[2]); // CRO → USDC
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [slippageBps, setSlippageBps] = useState(50); // 0.5%
  const [deadline, setDeadline] = useState(20); // minutes

  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [priceImpact, setPriceImpact] = useState(0);
  const [balanceIn, setBalanceIn] = useState('0');
  const [balanceOut, setBalanceOut] = useState('0');
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTokenInModal, setShowTokenInModal] = useState(false);
  const [showTokenOutModal, setShowTokenOutModal] = useState(false);

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset tokens when network changes
  useEffect(() => {
    const list = getTokenList(network.chainId);
    setTokenIn(list[0]);
    setTokenOut(list[2] ?? list[1]);
    setAmountIn('');
    setAmountOut('');
  }, [network.chainId]);

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const provider = getDexProvider(network.chainId);
      const [binResult, boutResult] = await Promise.allSettled([
        tokenIn.isNative
          ? provider.getBalance(walletAddress).then((b) => formatAmount(b, 18))
          : new ethers.Contract(tokenIn.address, ERC20_ABI, provider)
              .balanceOf(walletAddress)
              .then((b: bigint) => formatAmount(b, tokenIn.decimals)),
        tokenOut.isNative
          ? provider.getBalance(walletAddress).then((b: bigint) => formatAmount(b, 18))
          : new ethers.Contract(tokenOut.address, ERC20_ABI, provider)
              .balanceOf(walletAddress)
              .then((b: bigint) => formatAmount(b, tokenOut.decimals)),
      ]);
      if (binResult.status === 'fulfilled') setBalanceIn(binResult.value);
      if (boutResult.status === 'fulfilled') setBalanceOut(boutResult.value);
    } catch {/* silent */}
  }, [walletAddress, tokenIn, tokenOut]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // Get quote via backend API — avoids all CORS/RPC-proxy issues
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (!amountIn || parseFloat(amountIn) <= 0) { setAmountOut(''); setPriceImpact(0); return; }

    quoteTimer.current = setTimeout(async () => {
      setIsQuoting(true);
      setError(null);
      try {
        const amountInBn = parseAmount(amountIn, tokenIn.decimals);
        const path = buildSwapPath(tokenIn.address, tokenOut.address, network.chainId);
        let outBn: bigint;

        // ── Try backend API first (avoids CORS) ──────────────────────────
        try {
          const params = new URLSearchParams({
            tokenIn:    tokenIn.address,
            tokenOut:   tokenOut.address,
            amountIn:   amountIn,
            decimalsIn: String(tokenIn.decimals),
            chainId:    String(network.chainId),
          });
          const res = await fetch(`/api/dex/quote?${params}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Backend quote failed');
          outBn = BigInt(data.amountOut);
        } catch (_backendErr) {
          // ── Fallback: call router.getAmountsOut directly via MetaMask ──
          // getDexProvider uses drpc.org HTTP directly for testnet — more reliable than proxy
          const provider = getDexProvider(network.chainId);
          const amounts = await getSwapQuote(routerConfig.router, amountInBn, path, provider);
          outBn = amounts[amounts.length - 1];
        }

        setAmountOut(formatAmount(outBn, tokenOut.decimals, 8));

        // Price impact via pool info (best-effort)
        try {
          const pairParams = new URLSearchParams({
            tokenA:  tokenIn.address,
            tokenB:  tokenOut.address,
            chainId: String(network.chainId),
          });
          const pairRes  = await fetch(`/api/pool/info?${pairParams}`);
          const pairData = await pairRes.json();
          if (pairRes.ok && pairData.exists) {
            const r0 = BigInt(pairData.reserve0);
            const r1 = BigInt(pairData.reserve1);
            // routerConfig.wcro is now populated by getRouterConfig(); fallback to getWCROAddress for safety
            const wcroAddr = routerConfig.wcro ?? getWCROAddress(network.chainId);
            const inAddr = (tokenIn.isNative ? wcroAddr : tokenIn.address).toLowerCase();
            const reserveIn  = pairData.token0?.toLowerCase() === inAddr ? r0 : r1;
            const reserveOut = pairData.token0?.toLowerCase() === inAddr ? r1 : r0;
            setPriceImpact(calcPriceImpact(amountInBn, outBn, reserveIn, reserveOut));
          } else {
            setPriceImpact(0.3);
          }
        } catch { setPriceImpact(0.3); }
      } catch (err: any) {
        setAmountOut('');
        const msg = err.message || '';
        if (msg.includes('liquidity') || msg.includes('INSUFFICIENT')) {
          setError(`Insufficient liquidity for this pair on ${routerConfig.name}`);
        } else {
          setError(`Quote failed: ${msg.slice(0, 100)}`);
        }
      } finally {
        setIsQuoting(false);
      }
    }, 600);

    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [amountIn, tokenIn, tokenOut, network.chainId]);

  const flipTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(amountOut);
    setAmountOut('');
  };

  const setMaxBalance = () => setAmountIn(balanceIn);

  const handleSwap = async () => {
    if (!walletAddress || !window.ethereum || !amountIn || !amountOut) return;
    setIsSwapping(true);
    setError(null);
    setLastTx(null);

    const notifId = addNotification({ type: 'loading', title: 'Preparing Swap…', message: 'Waiting for wallet confirmation…', duration: 0 });

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Verify we're on the right chain
      const network2 = await provider.getNetwork();
      if (Number(network2.chainId) !== network.chainId) {
        throw new Error(`Wrong network. Please switch to ${network.name} in your wallet.`);
      }

      const router = new ethers.Contract(routerConfig.router, ROUTER_ABI, signer);
      const amountInBn = parseAmount(amountIn, tokenIn.decimals);
      const amountOutMin = applySlippage(parseAmount(amountOut, tokenOut.decimals), slippageBps);
      const dl = getDeadline(deadline);
      const path = buildSwapPath(tokenIn.address, tokenOut.address, network.chainId);

      let tx: ethers.TransactionResponse;

      if (isNativeCRO(tokenIn.address)) {
        // CRO → Token: path[0] must be WCRO
        updateNotification(notifId, { type: 'loading', title: 'Confirm in Wallet', message: `Swapping ${amountIn} CRO → ${amountOut} ${tokenOut.symbol}`, duration: 0 });
        tx = await router.swapExactETHForTokens(amountOutMin, path, walletAddress, dl, { value: amountInBn });
      } else if (isNativeCRO(tokenOut.address)) {
        // Token → CRO: needs approval first
        setIsApproving(true);
        updateNotification(notifId, { type: 'loading', title: 'Step 1/2 — Approve', message: `Approving ${tokenIn.symbol} for swap…`, duration: 0 });
        await ensureApproval(tokenIn.address, walletAddress, routerConfig.router, amountInBn, signer, network.chainId);
        setIsApproving(false);
        updateNotification(notifId, { type: 'loading', title: 'Step 2/2 — Confirm Swap', message: `Swapping ${amountIn} ${tokenIn.symbol} → CRO`, duration: 0 });
        tx = await router.swapExactTokensForETH(amountInBn, amountOutMin, path, walletAddress, dl);
      } else {
        // Token → Token
        setIsApproving(true);
        updateNotification(notifId, { type: 'loading', title: 'Step 1/2 — Approve', message: `Approving ${tokenIn.symbol}…`, duration: 0 });
        await ensureApproval(tokenIn.address, walletAddress, routerConfig.router, amountInBn, signer, network.chainId);
        setIsApproving(false);
        updateNotification(notifId, { type: 'loading', title: 'Step 2/2 — Confirm Swap', message: `Swapping ${amountIn} ${tokenIn.symbol} → ${tokenOut.symbol}`, duration: 0 });
        tx = await router.swapExactTokensForTokens(amountInBn, amountOutMin, path, walletAddress, dl);
      }

      updateNotification(notifId, { type: 'loading', title: 'Transaction Submitted', message: `Waiting for confirmation… TX: ${tx.hash.slice(0, 10)}…`, duration: 0 });
      await tx.wait();

      setLastTx(tx.hash);
      setAmountIn('');
      setAmountOut('');
      updateNotification(notifId, { type: 'success', title: 'Swap Complete!', message: `TX: ${tx.hash.slice(0, 10)}… — View on Explorer`, duration: 8000 });
      fetchBalances();
    } catch (err: any) {
      const isRejected = err.code === 4001 || err.code === 'ACTION_REJECTED';
      if (isRejected) {
        updateNotification(notifId, { type: 'info', title: 'Swap Cancelled', message: 'Transaction rejected in wallet.', duration: 4000 });
      } else {
        const msg = err.reason || err.shortMessage || err.data?.message || err.message || 'Swap failed';
        setError(msg);
        updateNotification(notifId, { type: 'error', title: 'Swap Failed', message: msg, duration: 8000 });
      }
    } finally {
      setIsSwapping(false);
      setIsApproving(false);
    }
  };

  const canSwap = walletAddress && amountIn && amountOut && !isQuoting && !isSwapping && !error;
  const priceImpactColor = priceImpact > 5 ? 'text-red-400' : priceImpact > 2 ? 'text-yellow-400' : 'text-green-400';

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Token Swap</h1>
        <p className="text-slate-400 text-sm">Swap tokens on Cronos via {routerConfig.name}</p>
      </div>

      {/* Testnet notice */}
      {network.chainId === 338 && (
        <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs">
          <span className="text-yellow-400 mt-0.5 flex-shrink-0">⚠️</span>
          <div className="text-yellow-300/90 space-y-1.5">
            <p><strong className="text-yellow-300">Testnet mode active.</strong> The DEX router is deployed but pools have <strong>no liquidity by default</strong>. To test swaps:</p>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-yellow-300/80">
              <li>Get free TCRO from the <a href="https://cronos.org/faucet" target="_blank" rel="noopener noreferrer" className="underline text-yellow-400 hover:text-yellow-300">Cronos Faucet</a></li>
              <li>Deploy a test ERC-20 token via <strong>Token Creator</strong></li>
              <li>Add TCRO + your token liquidity in <strong>Liquidity Manager</strong></li>
              <li>Return here to swap — the pool will now have reserves</li>
            </ol>
          </div>
        </div>
      )}

      {/* Main swap card */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-white font-bold">Swap</span>
          <div className="flex items-center gap-2">
            <button onClick={fetchBalances} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings dropdown */}
        {showSettings && (
          <div className="mx-5 mb-3 p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">Slippage Tolerance</p>
              <div className="flex gap-2">
                {[10, 50, 100].map((bps) => (
                  <button key={bps} onClick={() => setSlippageBps(bps)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${slippageBps === bps ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                    {bps / 100}%
                  </button>
                ))}
                <div className="flex-1 relative">
                  <input type="number" min="1" max="5000" value={slippageBps / 100}
                    onChange={(e) => setSlippageBps(Math.min(5000, Math.max(1, Math.round(parseFloat(e.target.value || '0') * 100))))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:border-blue-500 outline-none" />
                  <span className="absolute right-2 top-1.5 text-xs text-slate-500">%</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1">Transaction Deadline</p>
              <div className="flex items-center gap-2">
                <input type="number" min="1" max="60" value={deadline} onChange={(e) => setDeadline(parseInt(e.target.value) || 20)}
                  className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-blue-500 outline-none" />
                <span className="text-xs text-slate-500">minutes</span>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 pb-5 space-y-2">
          {/* Token In */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">You pay</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Balance: {balanceIn} {tokenIn.symbol}</span>
                <button onClick={setMaxBalance} className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors">MAX</button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="number" value={amountIn} onChange={(e) => setAmountIn(e.target.value)}
                placeholder="0.0" min="0"
                className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder-slate-700" />
              <button onClick={() => setShowTokenInModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                  {tokenIn.symbol.slice(0, 2)}
                </div>
                <span className="font-bold text-white text-sm">{tokenIn.symbol}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Flip button */}
          <div className="flex justify-center">
            <button onClick={flipTokens}
              className="w-9 h-9 bg-slate-800 hover:bg-blue-600 border-2 border-slate-900 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all">
              <ArrowDownUp className="w-4 h-4" />
            </button>
          </div>

          {/* Token Out */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">You receive</span>
              <span className="text-xs text-slate-500">Balance: {balanceOut} {tokenOut.symbol}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-2xl font-bold text-white">
                {isQuoting ? (
                  <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                ) : (
                  <span className={amountOut ? '' : 'text-slate-700'}>{amountOut || '0.0'}</span>
                )}
              </div>
              <button onClick={() => setShowTokenOutModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                  {tokenOut.symbol.slice(0, 2)}
                </div>
                <span className="font-bold text-white text-sm">{tokenOut.symbol}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Swap details */}
          {amountIn && amountOut && !isQuoting && (
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Rate</span>
                <span className="text-slate-300">1 {tokenIn.symbol} = {(parseFloat(amountOut) / parseFloat(amountIn)).toFixed(6)} {tokenOut.symbol}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Price Impact</span>
                <span className={priceImpactColor}>{priceImpact.toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Min. Received ({slippageBps / 100}% slippage)</span>
                <span className="text-slate-300">{formatAmount(applySlippage(parseAmount(amountOut, tokenOut.decimals), slippageBps), tokenOut.decimals, 6)} {tokenOut.symbol}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Router</span>
                <a href={`${network.explorerUrl}/address/${routerConfig.router}`} target="_blank" rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                  {routerConfig.name} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Last TX */}
          {lastTx && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-xs text-green-400">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Swap confirmed!</span>
              <a href={`${network.explorerUrl}/tx/${lastTx}`} target="_blank" rel="noreferrer"
                className="ml-auto text-green-300 hover:text-white flex items-center gap-1 transition-colors">
                View <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Swap button */}
          {!walletAddress ? (
            <div className="w-full py-4 bg-slate-800 text-slate-400 rounded-xl text-center font-semibold text-sm">
              Connect wallet to swap
            </div>
          ) : (
            <button onClick={handleSwap} disabled={!canSwap}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30">
              {isApproving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Approving {tokenIn.symbol}…</>
              ) : isSwapping ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Swapping…</>
              ) : isQuoting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Getting quote…</>
              ) : !amountIn ? (
                'Enter an amount'
              ) : error ? (
                'No liquidity'
              ) : (
                `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`
              )}
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl text-xs text-slate-500 space-y-1">
        <p>Trades route through <strong className="text-slate-400">{routerConfig.name}</strong> — a Uniswap V2-compatible DEX on Cronos.</p>
        <p>Prices update every time you change the input amount. Slippage and deadline protect against front-running and stale quotes.</p>
      </div>

      {/* Modals */}
      {showTokenInModal && (
        <TokenSelectorModal tokens={tokens} title="Select input token" chainId={network.chainId}
          walletAddress={walletAddress}
          selectedAddress={tokenIn.address} onClose={() => setShowTokenInModal(false)}
          onSelect={(t) => { setTokenIn(t); setAmountIn(''); setAmountOut(''); }} />
      )}
      {showTokenOutModal && (
        <TokenSelectorModal tokens={tokens} title="Select output token" chainId={network.chainId}
          walletAddress={walletAddress}
          selectedAddress={tokenOut.address} onClose={() => setShowTokenOutModal(false)}
          onSelect={(t) => { setTokenOut(t); setAmountOut(''); }} />
      )}
    </div>
  );
}

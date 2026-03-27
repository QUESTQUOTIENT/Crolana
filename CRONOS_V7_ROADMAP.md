# Cronos Studio — v7 Fix Log + Future Version Roadmap

## v7.1 Bug Fixes Applied (This Session)
All fixes target the Swap and Liquidity engines.

---

### FIX 1 — dex.ts: Duplicate content removed
**Root cause:** A prior str_replace prepended new code without removing old code.
The file had two copies of ROUTER_ABI, buildSwapPath, ensureApproval, etc.
The old copies (appended) were shadowing the new ones in some module
resolution scenarios and causing type errors at runtime.
**Fix:** Rewrote dex.ts as a single authoritative file with no duplicates.

---

### FIX 2 — buildSwapPath: ERC20→ERC20 now routes through WCRO
**Root cause:** Old buildSwapPath returned [tokenA, tokenB] for all pairs.
VVS Finance (Uniswap V2 fork) only maintains X/WCRO pools. A direct
USDC→VVS or USDT→ETH path does not exist on-chain. The router call
would revert with INSUFFICIENT_LIQUIDITY or INVALID_PATH.
**Fix:**
  - CRO ↔ ERC20   → [WCRO, token]         (direct pool exists)
  - WCRO ↔ ERC20  → [WCRO, token]         (direct pool exists)
  - ERC20 ↔ ERC20 → [tokenA, WCRO, tokenB] (routes through hub)
This matches how VVS Finance's own frontend routes swaps.

---

### FIX 3 — ensureApproval: Return type unified as void
**Root cause:** Old signature returned `Promise<ethers.TransactionReceipt | null>`.
New signature returns `Promise<void>`.
Callers used `await ensureApproval(...)` without capturing the return value,
which worked, but TypeScript would error on the type mismatch between
old and new signatures if both existed in the same file.
**Fix:** Single void-returning implementation. Approval tx is awaited
internally and receipt.status is checked before returning.
Native CRO skipped (no ERC20 approval needed for ETH-value calls).

---

### FIX 4 — FACTORY_ABI: createPair added
**Root cause:** Old FACTORY_ABI only had getPair/allPairs/allPairsLength.
LiquidityManager could check if a pool existed but could not create one.
**Fix:** Added 'function createPair(address tokenA, address tokenB) external returns (address pair)'
to FACTORY_ABI.

---

### FIX 5 — LiquidityManager: createPairIfNeeded before addLiquidity
**Root cause:** When a user tried to add liquidity to a new token pair,
the addLiquidity call would fail because no pair contract existed at the
factory yet. The router's addLiquidity does NOT auto-create the pair.
**Fix:** When pairInfo === null (no existing pool), call createPairIfNeeded()
before calling addLiquidity/addLiquidityETH. This submits a createPair tx
through the signer first, waits for it to mine, then proceeds.
PAIR_EXISTS revert is caught and ignored (race condition guard).

---

### FIX 6 — LiquidityManager: Token B auto-calculated from pool reserves
**Root cause:** Users had to manually enter both token amounts. On a
Uniswap V2 pool, the ratio is fixed by reserves. Entering the wrong ratio
causes the router to take the smaller amount and refund the excess, leading
to confusion. Worse, it would cause silent partial fills.
**Fix:** A useEffect watches amountA changes. When a pool exists (pairInfo set),
it calls calcLiquidityAmountB(amtA, reserveA, reserveB) and auto-fills
amountB. Formula: amountB = amountA * reserveB / reserveA (Uniswap V2 quote).
New pools (no pairInfo) still allow manual entry — user sets initial price.
The input remains editable so users can override if needed.

---

### FIX 7 — SwapPage: updateNotification was not destructured
**Root cause:** SwapPage used `updateNotification(...)` throughout handleSwap
but only destructured `addNotification` from useAppStore(). This caused a
ReferenceError at runtime the moment any swap notification needed updating.
**Fix:** Added `updateNotification` to the store destructure.

---

### FIX 8 — SwapPage: Improved quote error messages
**Root cause:** All quote failures showed the same generic message.
**Fix:** Three distinct error messages:
  - INSUFFICIENT_LIQUIDITY → "Insufficient liquidity for this pair"
  - INVALID_PATH → "Invalid swap path — try a different token pair"
  - Other → shows first 80 chars of actual error message

---

## What Was Already Correct (Reports Were Wrong)
The following were claimed as bugs but were already implemented:

1. **"No wallet transaction execution"** — WRONG. The router was already
   instantiated with `signer` not `provider`:
   `new ethers.Contract(routerConfig.router, ROUTER_ABI, signer)`
   All swap functions (swapExactETHForTokens, swapExactTokensForETH,
   swapExactTokensForTokens) were already signed transactions.
   `await tx.wait()` was already called.

2. **"Token approval not implemented"** — WRONG. ensureApproval() was already
   called in handleSwap for every ERC20 input token. The approval flow
   (check allowance → approve MaxUint256 → wait for mining → proceed) was
   already fully implemented.

3. **"Native CRO handling broken"** — WRONG. NATIVE_CRO_ADDRESS was already
   correctly handled. isNativeCRO() was used in both SwapPage and
   LiquidityManager to route to swapExactETHForTokens/addLiquidityETH.

---

## Future Version Roadmap

=============================================================================
VERSION 8 — DEX UPGRADE + WALLET IMPROVEMENTS
Target: Fully production-ready trading experience
=============================================================================

### 8.1 DEX: Multi-router support
- Add MM Finance router alongside VVS Finance
- Route quotes through both routers, pick best output (smart order routing)
- Show which router is being used for each swap
- Config: toggle preferred DEX in Settings

### 8.2 DEX: Token allowance management UI
- New "Approvals" tab in SwapPage
- List all tokens with active allowances to the router
- Revoke button for each — calls approve(router, 0)
- Useful for security — reduces attack surface

### 8.3 DEX: Price chart
- Use DexScreener or CronosScope API to show 24h price chart
- Overlay on swap card when a pair is selected
- Shows price in both directions (CRO terms and USD terms)

### 8.4 Wallet: WalletConnect v2 support
- Currently only MetaMask (injected provider) supported
- Add WalletConnect modal for mobile wallets and hardware wallets
- Integrate via @walletconnect/modal or wagmi + viem

### 8.5 Wallet: Multi-account support
- Allow switching between connected accounts without re-connecting
- Show account nicknames / ENS / saved labels
- Persist preferred account in localStorage

### 8.6 Transaction history
- New /history page
- Query Cronos Explorer API for all txs from connected wallet
- Filter by type: swap, liquidity, mint, deploy
- Replay failed txs with one click

=============================================================================
VERSION 9 — NFT LAUNCHPAD FULL PRODUCTION
Target: Complete self-serve NFT launch platform
=============================================================================

### 9.1 Mint Zone: Shareable public page
- Route: /mint/:contractAddress — standalone no-auth page
- Anyone can visit and mint from any configured collection
- Embeddable via iframe for external websites
- Social meta tags (OpenGraph) for Twitter/Discord previews

### 9.2 Allowlist management UI
- Upload CSV of wallet addresses
- On-chain: compute Merkle root server-side
- Frontend: set Merkle root via setMerkleRoot() owner call
- Generate proof for any address (download JSON)
- Proof verification status per address

### 9.3 Contract verification automation
- Auto-verify deployed contracts on Cronoscan API after deploy
- Show verification status badge in Contract Builder
- Link directly to verified source on Explorer
- Requires CRONOSCAN_API_KEY in .env

### 9.4 Dutch Auction mint type
- New contract template: price decreases over time
- Start price, end price, duration, step interval
- Smart contract: setCost() called automatically or use on-chain time-based logic
- UI: countdown timer showing current price + next price drop

### 9.5 Batch airdrop with CSV upload (gas-efficient)
- Current airdrop is one-by-one
- New: parse CSV of [address, tokenId or amount]
- Use ownerMint in batches of 20 per tx
- Progress bar showing batch progress
- Gas estimate before sending

### 9.6 NFT Analytics upgrade
- Holder leaderboard (top 10 wallets by holdings)
- Wallet concentration chart (Gini coefficient)
- Floor price history from marketplace APIs
- Reveal countdown timer
- Real block timestamps on transfer events (currently approximated)

=============================================================================
VERSION 10 — PLATFORM & INFRASTRUCTURE
Target: Production-grade backend, auth, multi-user support
=============================================================================

### 10.1 Replace file-based DB with SQLite/PostgreSQL
- Current db.json has no concurrency safety, no indexing, no pagination
- Migrate to better-sqlite3 (already installed) or Prisma + SQLite
- Tables: users, deployments, collections, analytics_snapshots
- Proper pagination for /api/contract/deployments

### 10.2 Real blockchain event indexer
- Background service that polls Transfer/Mint events
- Store events in DB for instant analytics (no RPC call per page load)
- WebSocket push to frontend for live mint counter
- Currently analytics re-fetches all events on every page view

### 10.3 IPFS upload queue improvements
- Retry logic for failed uploads (exponential backoff)
- Resume interrupted uploads (track CIDs per file)
- Multi-gateway fallback: Lighthouse → Pinata → NFT.Storage
- Real-time upload speed indicator

### 10.4 Server-side session auth
- Current JWT is stateless, no revocation
- Add Redis/in-memory token blacklist for logout
- Refresh token pattern (short-lived access + long-lived refresh)
- Rate limiting per wallet address (prevent spam deployments)

### 10.5 Collection dashboard (multi-contract view)
- Show all contracts deployed by connected wallet
- Aggregate stats: total revenue, total minted, active collections
- Quick actions per collection: pause, reveal, withdraw, set cost
- Replaces "you can only manage one contract at a time" limitation

### 10.6 Mobile responsive overhaul
- Current layout is desktop-first with fixed sidebar
- Add bottom navigation bar for mobile
- Swap card, mint controls touch-optimized
- PWA manifest for "Add to Home Screen" on mobile

### 10.7 Error monitoring
- Integrate Sentry (frontend + backend)
- Capture unhandled promise rejections, React render errors
- Add breadcrumbs for DeFi transaction flows
- Alerts for server-side errors (Discord webhook)

=============================================================================
KNOWN TECHNICAL DEBT (carry forward)
=============================================================================
- [ ] solc compilation is synchronous — blocks the Express event loop for 15-30s
      Fix: run in worker_threads or child_process
- [ ] 4 npm vulnerabilities (run `npm audit fix`)
- [ ] prisma/schema.prisma exists but is unused (dead file — remove or adopt)
- [ ] services/analytics-indexer/ and services/cronos-listener/ are stubs
- [ ] MintingDashboard: withdraw() should gas-estimate before signing
- [ ] Auth: no token blacklisting on logout
- [ ] SwapPage: token list is hardcoded — should fetch from VVS Finance subgraph

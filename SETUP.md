# Cronos Studio v7.1 — Setup Guide

## Quick Start

```bash
# 1. Install dependencies (includes new mpl-candy-machine package)
npm install

# 2. Copy env config
cp .env.example .env

# 3. Start the app
npm run dev
```

Then open http://localhost:3000

---

## Changes in This Release (Bug Fixes)

### Critical Fixes
- **Candy Machine package**: Replaced broken `@metaplex-foundation/mpl-core-candy-machine`
  with the correct `@metaplex-foundation/mpl-candy-machine` (v5)
- **Raydium API v3**: Updated from deprecated v2 (`api.raydium.io/v2`) to v3
  (`api-v3.raydium.io`) for pool data and liquidity transactions
- **Vite build config**: Added `optimizeDeps.exclude` for all Solana/Metaplex packages
  to prevent Node.js polyfill errors during dev bundling
- **Jupiter price API**: Fixed endpoint from non-existent v6 to v4
- **SolanaMinting scope error**: Removed invalid `{error && null}` reference in ActionButton
- **Cluster sync**: SolanaTokenBuilder now syncs cluster when user switches network

---

## Environment Variables (.env)

```env
# Required for IPFS uploads
PINATA_API_KEY=your_key_here
PINATA_API_SECRET=your_secret_here

# Optional — use your own RPC for better reliability
CRONOS_MAINNET_RPC=https://evm.cronos.org
CRONOS_TESTNET_RPC=https://cronos-testnet.drpc.org

# Optional — Gemini AI Assistant
GEMINI_API_KEY=your_key_here
```

---

## Network Support

| Network | Chain | Wallet |
|---------|-------|--------|
| Cronos Mainnet | EVM (chainId 25) | MetaMask / Crypto.com DeFi |
| Cronos Testnet | EVM (chainId 338) | MetaMask (test network) |
| Solana Mainnet | Solana | Phantom |
| Solana Devnet | Solana | Phantom (devnet mode) |

Switch networks via the dropdown in the top-right header.

---

## Features by Network

### Cronos (EVM)
- NFT collection creation (generative art → IPFS → ERC-721A contract → deploy)
- VVS Finance token swap
- VVS liquidity pool management
- ERC-20 token builder
- NFT gallery, launchpad, marketplace prep
- On-chain analytics

### Solana
- SPL token creation (with mint/freeze authority management)
- Jupiter Aggregator V6 token swap (best price across all Solana DEXs)
- Raydium AMM liquidity management
- Metaplex NFT minting (single NFT + Candy Machine v3)
- On-chain Solana analytics (SPL token + NFT mint stats)

---

## Troubleshooting

**Error: mpl-core-candy-machine not found**
→ You have old files. Replace `src/lib/solanaMetaplex.ts` with the new version and run `npm install`.

**Solana RPC errors on devnet**
→ Get free devnet SOL at https://faucet.solana.com, then retry.

**MetaMask -32603 errors**
→ These are prevented by the provider layer. If they appear, check you're on the correct network.

**Vite pre-transform errors for @solana/web3.js**
→ These are resolved by the `optimizeDeps.exclude` config in `vite.config.ts`.

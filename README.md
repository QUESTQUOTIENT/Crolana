# Crolana — NFT + DeFi Launchpad

**Dual-chain launchpad for Cronos (EVM) and Solana (SVM).** Build, deploy, and manage NFT collections and DeFi operations on both chains from a single interface — no coding required.

[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/WUxR2w8zM7)
[![Twitter](https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white)](https://x.com/CronosDevStudio)

---

## Features

| Category | Cronos (EVM) | Solana (SVM) |
|---|---|---|
| NFT Generation | ✅ Generative art engine, rarity, traits | ✅ Same engine |
| IPFS Upload | ✅ Lighthouse / Pinata / Infura | ✅ Same pipeline |
| Smart Contracts | ✅ ERC-721, 721A, 1155, ERC-20 | ✅ SPL Token + Metaplex |
| Minting | ✅ Phases, allowlist, Merkle proof | ✅ Candy Machine v3 |
| DEX / Swap | ✅ VVS Finance (Uniswap V2) | ✅ Jupiter Aggregator |
| Liquidity | ✅ VVS Finance pools | ✅ Raydium AMM |
| Token Builder | ✅ ERC-20 with tax/limits | ✅ SPL Token |
| Analytics | ✅ On-chain Transfer events | ✅ SPL mint analytics |
| AI Assistant | ✅ Claude-powered (all pages) | ✅ Same |
| Wallet | ✅ MetaMask, injected wallets | ✅ Phantom, Solflare |

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- PostgreSQL (or skip with `DATABASE_URL=file:./dev.db` for SQLite)

### Install & Run

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Copy environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL at minimum

# 3. Set up database
npx prisma generate
npx prisma db push

# 4. Start development server (Express + Vite HMR)
npm run dev
```

Open `http://localhost:3000`

---

## Deploy to Railway

### One-click Deploy

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Add a **PostgreSQL** plugin (Railway Dashboard → Add Plugin)
4. Set environment variables (see below)
5. Railway auto-detects `nixpacks.toml` and builds with `npm install --legacy-peer-deps`

### Required Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db` |
| `JWT_SECRET` | Random secret for auth tokens | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256 key for IPFS API keys | `openssl rand -hex 32` |
| `NODE_ENV` | Must be `production` | `production` |
| `ALLOWED_ORIGINS` | Your Railway domain | `https://yourapp.up.railway.app` |

### Optional (enables more features)

| Variable | Description |
|---|---|
| `HELIUS_API_KEY` | Solana RPC (better reliability) |
| `COVALENT_API_KEY` | Cronos analytics |
| `CRONOS_MAINNET_RPC` | Custom Cronos RPC endpoint |
| `SOLANA_MAINNET_RPC` | Custom Solana RPC endpoint |
| `ANTHROPIC_API_KEY` | Powers the AI Assistant |
| `LIGHTHOUSE_API_KEY` | IPFS via Lighthouse |
| `PINATA_API_KEY` + `PINATA_SECRET` | IPFS via Pinata |

### Build & Start Commands
```
Build:  npm run build       # prisma generate + vite build
Start:  npm run start       # tsx server.ts (serves dist/)
```

---

## Architecture

```
Frontend (React 19 + TypeScript + Tailwind CSS v4)
    ↓ REST API calls
Backend (Express + TypeScript)
    ↓ RPC proxy (no CORS issues)
Blockchain RPCs (Cronos EVM + Solana)
    ↓
External APIs (Jupiter, Raydium, VVS Finance)
```

**Key design decisions:**
- All blockchain SDK calls (`@solana/web3.js`, `@metaplex-foundation/*`) are **dynamic imports** loaded only when the user navigates to a Solana page — no bundle bloat at startup
- Wallet signing happens **in the browser** (MetaMask / Phantom) — server never sees private keys
- RPC calls from the frontend go through `/api/rpc/*` proxy to avoid CORS and enable server-side rotation

---

## Wallets Supported

**Cronos (EVM):** MetaMask, Crypto.com DeFi Wallet, Coinbase Wallet, any injected EVM wallet

**Solana:** Phantom, Solflare, Backpack, MetaMask (with Solana enabled)

**Mobile:** Deep links to Phantom/MetaMask app when no wallet is injected in the browser

---

## Community

- **Discord:** https://discord.gg/WUxR2w8zM7
- **Twitter/X:** https://x.com/CronosDevStudio

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Vite 6, ethers.js v6, Recharts
- **Backend:** Express, TypeScript, tsx, solc, Prisma ORM
- **Cronos:** ERC-721/721A/1155/ERC-20, VVS Finance V2, OpenZeppelin v5
- **Solana:** SPL Token, Metaplex Token Metadata, Candy Machine v3, Jupiter V6, Raydium
- **Deploy:** Railway (Nixpacks), Docker Compose (self-hosted)

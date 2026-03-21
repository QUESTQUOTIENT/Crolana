# 🚀 Cronos Studio

A full-featured NFT collection launchpad for the Cronos blockchain.  
Build, deploy, and manage ERC-721 / ERC-721A collections — all from one beautiful dashboard.

---

## ✨ Features

| Feature | Status |
|---------|--------|
| Generative art builder (layer-based) | ✅ |
| Asset upload & management | ✅ |
| Metadata builder & validator | ✅ |
| IPFS upload (Pinata / Infura / NFT.Storage) | ✅ |
| Smart contract generator (ERC-721 / ERC-721A) | ✅ |
| Solidity compiler (solc) | ✅ |
| Minting dashboard (phases, allowlist, airdrop) | ✅ |
| Merkle tree allowlist generator | ✅ |
| ERC-20 Token builder | ✅ |
| Analytics dashboard | ✅ |
| MetaMask / wallet connect | ✅ |
| Reveal manager | ✅ |
| Marketplace prep | ✅ |
| AES-256 encrypted IPFS key storage | ✅ |
| Rate limiting & security headers | ✅ |

---

## 🛠 Prerequisites

- Node.js ≥ 18
- npm ≥ 9

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env and fill in your ENCRYPTION_KEY (required) and any IPFS keys

# 3. Start development server (frontend + backend combined)
npm run dev

# Open http://localhost:3000
```

---

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start full-stack dev server (Vite + Express) |
| `npm run dev:frontend` | Start Vite frontend only (proxies /api to port 3000) |
| `npm run build` | Build frontend for production |
| `npm run start` | Start production server |
| `npm run lint` | TypeScript type-check |

---

## 🔐 Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Required
ENCRYPTION_KEY=<32-char random string>

# Optional — IPFS keys can also be configured in the UI
PINATA_JWT=<your-pinata-jwt>
GEMINI_API_KEY=<your-gemini-key>
```

Generate a secure encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🏗 Architecture

```
cronos-nft-studio/
├── server.ts              # Express entry point (serves API + Vite SPA)
├── server/
│   ├── routes/            # Express route definitions
│   ├── controllers/       # Request handlers with validation
│   ├── services/          # Business logic (IPFS, compiler, queue)
│   ├── middleware/        # Auth, rate limit, validation
│   ├── utils/             # Encryption helpers
│   └── db.ts              # JSON file database with atomic writes
├── src/
│   ├── pages/             # React page components
│   ├── components/        # Shared UI components
│   ├── store.ts           # Zustand global state
│   └── types.ts           # TypeScript type definitions
├── prisma/                # Prisma schema (optional upgrade path)
└── .env.example           # Environment variable template
```

---

## 🌐 Deployment

### Docker (recommended)
```bash
docker build -t cronos-nft-studio .
docker run -p 3000:3000 --env-file .env cronos-nft-studio
```

### Manual
```bash
npm run build
NODE_ENV=production npm start
```

---

## ⚠️ Security

- API keys are encrypted with AES-256-CBC before storage
- Set a **strong** `ENCRYPTION_KEY` in production
- Never commit `.env` or `db.json` to version control
- Rate limiting is applied to all API routes
- Security headers added via `helmet`

---

## 📄 License

MIT

# ─────────────────────────────────────────────────────────────
# NEW DEPENDENCIES — run these after extracting the zip
# ─────────────────────────────────────────────────────────────

# Solana signature verification (Fix #5)
# Required for server-side ed25519 signature verification of Phantom wallet sign-ins
npm install tweetnacl bs58

# That's it — all other new files use built-in Node.js or existing deps.
# (ethers, jsonwebtoken, prisma, express already in package.json)

# ─────────────────────────────────────────────────────────────
# OPTIONAL but recommended for full Fix #11/#12 (Ownership Sync):
# ─────────────────────────────────────────────────────────────
# Get API keys and add to .env:
#   HELIUS_API_KEY    — https://helius.dev        (Solana NFT sync)
#   COVALENT_API_KEY  — https://www.covalenthq.com (Cronos NFT sync, free tier)
#   MORALIS_API_KEY   — https://moralis.io         (EVM fallback)

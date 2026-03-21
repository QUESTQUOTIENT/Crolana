/**
 * src/lib/solanaMetaplex.ts
 *
 * Metaplex NFT minting for Solana using the Token Metadata standard.
 *
 * Modes:
 *   1. Single NFT  → mpl-token-metadata  createNft()
 *   2. Collection  → mpl-candy-machine   create() + mintV2()
 *
 * RPC: All connections go through the server proxy (/api/solana/rpc[/devnet])
 * to avoid CORS and to benefit from server-side RPC rotation/fallback.
 *
 * Metaplex packages are loaded via dynamic import() — they are excluded from
 * Vite pre-bundling (top-level await / Node built-ins incompatible with esbuild).
 */

// ─── RPC proxy helper ─────────────────────────────────────────────────────────
function getRpcProxyUrl(cluster: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return cluster === 'devnet'
    ? `${origin}/api/solana/rpc/devnet`
    : `${origin}/api/solana/rpc`;
}

// ─── Phantom → UMI signer adapter ────────────────────────────────────────────
// UMI needs a signer object; we bridge to Phantom's window.solana API.
function makePhantomSigner(walletPubkeyStr: string, umiPublicKey: (s: string) => any) {
  return {
    publicKey: umiPublicKey(walletPubkeyStr),
    signTransaction: async (tx: any) => {
      if (!window.solana?.signTransaction) throw new Error('Phantom not connected');
      return window.solana.signTransaction(tx);
    },
    signAllTransactions: async (txs: any[]) => {
      if (!window.solana?.signAllTransactions) throw new Error('Phantom not connected');
      return window.solana.signAllTransactions(txs);
    },
    signMessage: async (msg: Uint8Array) => {
      if (!window.solana?.signMessage) throw new Error('Phantom not connected');
      const { signature } = await window.solana.signMessage(msg, 'utf8');
      return signature;
    },
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SolNftConfig {
  name: string;
  symbol: string;
  description: string;
  metadataUri: string;           // IPFS URI — ipfs://Qm…
  sellerFeeBasisPoints: number;  // 0-10000 (500 = 5%)
  isMutable: boolean;
  cluster?: string;
}

export interface SolNftResult {
  mintAddress: string;
  txSignature: string;
  explorerUrl: string;
  metadataAddress: string;
}

export interface CandyMachineConfig {
  collectionName: string;
  symbol: string;
  description: string;
  sellerFeeBasisPoints: number;
  itemsAvailable: number;
  price: number;       // SOL per mint
  goLiveDate?: Date;
  cluster?: string;
}

export interface CandyMachineResult {
  candyMachineAddress: string;
  collectionMint: string;
  txSignature: string;
  explorerUrl: string;
}

// ─── Single NFT mint ──────────────────────────────────────────────────────────

export async function mintSolanaNft(config: SolNftConfig): Promise<SolNftResult> {
  const cluster = config.cluster ?? 'mainnet-beta';
  const rpcUrl  = getRpcProxyUrl(cluster);      // ← server proxy, not direct RPC

  if (!window.solana?.isPhantom) throw new Error('Phantom wallet not found. Install from https://phantom.app');
  if (!window.solana.publicKey)  throw new Error('Phantom wallet not connected. Please connect first.');

  const walletPubkey = window.solana.publicKey.toBase58();

  // Dynamic imports — Metaplex is excluded from optimizeDeps (top-level await issue)
  const { createUmi }  = await import('@metaplex-foundation/umi-bundle-defaults');
  const umi_           = await import('@metaplex-foundation/umi');
  const { mplTokenMetadata, createNft } = await import('@metaplex-foundation/mpl-token-metadata');

  const umi    = createUmi(rpcUrl).use(mplTokenMetadata());
  const signer = makePhantomSigner(walletPubkey, umi_.publicKey);
  umi.use(umi_.signerIdentity(signer as any));

  const mintKp = umi_.generateSigner(umi);

  await createNft(umi, {
    mint:                mintKp,
    name:                config.name,
    symbol:              config.symbol,
    uri:                 config.metadataUri,
    sellerFeeBasisPoints: umi_.percentAmount(config.sellerFeeBasisPoints / 100),
    isMutable:           config.isMutable,
    tokenOwner:          umi_.publicKey(walletPubkey),
  }).sendAndConfirm(umi);

  const mintAddress  = mintKp.publicKey.toString();
  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '';

  return {
    mintAddress,
    txSignature:     '',
    metadataAddress: '',
    explorerUrl: `https://solscan.io/address/${mintAddress}${clusterParam}`,
  };
}

// ─── Candy Machine v3 deploy ──────────────────────────────────────────────────

export async function deployCandyMachine(config: CandyMachineConfig): Promise<CandyMachineResult> {
  const cluster = config.cluster ?? 'mainnet-beta';
  const rpcUrl  = getRpcProxyUrl(cluster);      // ← server proxy

  if (!window.solana?.isPhantom) throw new Error('Phantom wallet not found.');
  if (!window.solana.publicKey)  throw new Error('Phantom wallet not connected.');

  const walletPubkey = window.solana.publicKey.toBase58();

  const { createUmi }  = await import('@metaplex-foundation/umi-bundle-defaults');
  const umi_           = await import('@metaplex-foundation/umi');
  const { mplTokenMetadata, createNft } = await import('@metaplex-foundation/mpl-token-metadata');
  // mpl-candy-machine is the Token Metadata candy machine (NOT mpl-core-candy-machine)
  const cm = await import('@metaplex-foundation/mpl-candy-machine');

  const umi = createUmi(rpcUrl)
    .use(mplTokenMetadata())
    .use(cm.mplCandyMachine());

  const signer = makePhantomSigner(walletPubkey, umi_.publicKey);
  umi.use(umi_.signerIdentity(signer as any));

  // Step 1: Create the collection NFT
  const collectionKp = umi_.generateSigner(umi);
  await createNft(umi, {
    mint:                collectionKp,
    name:                config.collectionName,
    symbol:              config.symbol,
    uri:                 '',
    sellerFeeBasisPoints: umi_.percentAmount(config.sellerFeeBasisPoints / 100),
    isCollection:        true,
    isMutable:           true,
  }).sendAndConfirm(umi);

  // Step 2: Create the Candy Machine
  const cmKp = umi_.generateSigner(umi);

  const guards: Record<string, any> = {
    solPayment: {
      lamports:    umi_.sol(config.price),
      destination: umi_.publicKey(walletPubkey),
    },
  };
  if (config.goLiveDate) {
    guards.startDate = { date: BigInt(Math.floor(config.goLiveDate.getTime() / 1000)) };
  }

  await cm.create(umi, {
    candyMachine:             cmKp,
    collection:               collectionKp.publicKey,
    collectionUpdateAuthority: signer as any,
    tokenStandard:            cm.TokenStandard.NonFungible,
    sellerFeeBasisPoints:     umi_.percentAmount(config.sellerFeeBasisPoints / 100),
    itemsAvailable:           config.itemsAvailable,
    symbol:                   config.symbol,
    isMutable:                true,
    guards,
  }).sendAndConfirm(umi);

  const cmAddr       = cmKp.publicKey.toString();
  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '';

  return {
    candyMachineAddress: cmAddr,
    collectionMint:      collectionKp.publicKey.toString(),
    txSignature:         '',
    explorerUrl: `https://solscan.io/address/${cmAddr}${clusterParam}`,
  };
}

// ─── Mint from existing Candy Machine ────────────────────────────────────────

export async function mintFromCandyMachine(params: {
  candyMachineAddress: string;
  collectionMint: string;
  cluster?: string;
}): Promise<{ mintAddress: string; txSignature: string }> {
  const { candyMachineAddress, collectionMint, cluster = 'mainnet-beta' } = params;
  const rpcUrl = getRpcProxyUrl(cluster);       // ← server proxy

  if (!window.solana?.isPhantom) throw new Error('Phantom wallet not found.');
  if (!window.solana.publicKey)  throw new Error('Phantom wallet not connected.');

  const walletPubkey = window.solana.publicKey.toBase58();

  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const umi_          = await import('@metaplex-foundation/umi');
  const { mplTokenMetadata } = await import('@metaplex-foundation/mpl-token-metadata');
  const cm = await import('@metaplex-foundation/mpl-candy-machine');

  const umi = createUmi(rpcUrl).use(mplTokenMetadata()).use(cm.mplCandyMachine());
  const signer = makePhantomSigner(walletPubkey, umi_.publicKey);
  umi.use(umi_.signerIdentity(signer as any));

  const nftMint = umi_.generateSigner(umi);
  const cmAcct  = await cm.fetchCandyMachine(umi, umi_.publicKey(candyMachineAddress));

  await cm.mintV2(umi, {
    candyMachine:   umi_.publicKey(candyMachineAddress),
    nftMint,
    collectionMint: umi_.publicKey(collectionMint),
    collectionUpdateAuthority: cmAcct.authority,
    tokenStandard:  cm.TokenStandard.NonFungible,
    mintArgs: {
      solPayment: umi_.some({ destination: cmAcct.authority }),
    },
  }).sendAndConfirm(umi);

  return {
    mintAddress: nftMint.publicKey.toString(),
    txSignature: '',
  };
}

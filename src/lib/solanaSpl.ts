/**
 * src/lib/solanaSpl.ts
 *
 * SPL Token creation and management for Solana.
 * Uses @solana/web3.js (browser bundle via vite alias) + @solana/spl-token.
 *
 * All Connection objects route through the Express server RPC proxy at
 * /api/solana/rpc[/devnet] — avoids CORS and handles RPC rotation server-side.
 *
 * Reference: https://solana.com/docs/tokens
 */

// ─── RPC helper ───────────────────────────────────────────────────────────────
// Always go through the server proxy, never direct to mainnet RPC (CORS-blocked).
function getRpcProxyUrl(cluster: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return cluster === 'devnet'
    ? `${origin}/api/solana/rpc/devnet`
    : `${origin}/api/solana/rpc`;
}

export interface SplTokenConfig {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  description?: string;
  imageUri?: string;
  revokeMintAuthority: boolean;
  revokeFreezeAuthority: boolean;
  cluster?: string;
}

export interface SplTokenResult {
  mintAddress: string;
  txSignature: string;
  associatedTokenAccount: string;
  explorerUrl: string;
}

export async function createSplToken(config: SplTokenConfig): Promise<SplTokenResult> {
  const cluster = config.cluster ?? 'mainnet-beta';
  const rpcUrl  = getRpcProxyUrl(cluster);

  if (!window.solana?.isPhantom)  throw new Error('Phantom wallet not found. Install from https://phantom.app');
  if (!window.solana.publicKey)   throw new Error('Phantom wallet not connected. Connect first.');

  // Dynamic imports — @solana packages excluded from Vite pre-bundle.
  // They load on first use (when user clicks "Create Token").
  const web3 = await import('@solana/web3.js');
  const spl  = await import('@solana/spl-token');

  const connection  = new web3.Connection(rpcUrl, 'confirmed');
  const payerPubkey = new web3.PublicKey(window.solana.publicKey.toBase58());

  // Generate a new keypair for the mint account
  const mintKeypair = web3.Keypair.generate();

  // Minimum SOL needed to make the mint account rent-exempt
  const mintRent = await connection.getMinimumBalanceForRentExemption(spl.MINT_SIZE);

  const transaction = new web3.Transaction();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer        = payerPubkey;

  // Instruction 1 — allocate the mint account
  transaction.add(
    web3.SystemProgram.createAccount({
      fromPubkey:      payerPubkey,
      newAccountPubkey: mintKeypair.publicKey,
      space:   spl.MINT_SIZE,
      lamports: mintRent,
      programId: spl.TOKEN_PROGRAM_ID,
    }),
  );

  // Instruction 2 — initialise the mint
  transaction.add(
    spl.createInitializeMintInstruction(
      mintKeypair.publicKey,
      config.decimals,
      payerPubkey,
      config.revokeFreezeAuthority ? null : payerPubkey,
      spl.TOKEN_PROGRAM_ID,
    ),
  );

  // Instruction 3 — create Associated Token Account for the creator
  const ataAddress = await spl.getAssociatedTokenAddress(
    mintKeypair.publicKey,
    payerPubkey,
    false,
    spl.TOKEN_PROGRAM_ID,
    spl.ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  transaction.add(
    spl.createAssociatedTokenAccountInstruction(
      payerPubkey, ataAddress, payerPubkey, mintKeypair.publicKey,
    ),
  );

  // Instruction 4 — mint initial supply to creator's ATA
  const supplyRaw = BigInt(
    Math.floor(parseFloat(config.initialSupply) * 10 ** config.decimals).toString(),
  );
  transaction.add(
    spl.createMintToInstruction(
      mintKeypair.publicKey, ataAddress, payerPubkey, supplyRaw,
    ),
  );

  // Instruction 5 (optional) — revoke mint authority → fixed supply
  if (config.revokeMintAuthority) {
    transaction.add(
      spl.createSetAuthorityInstruction(
        mintKeypair.publicKey,
        payerPubkey,
        spl.AuthorityType.MintTokens,
        null,
      ),
    );
  }

  // The mint keypair must co-sign (it authorises its own account creation)
  transaction.partialSign(mintKeypair);

  // Phantom adds the payer signature
  const signedTx  = await window.solana.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '';
  return {
    mintAddress: mintKeypair.publicKey.toBase58(),
    txSignature: signature,
    associatedTokenAccount: ataAddress.toBase58(),
    explorerUrl: `https://solscan.io/address/${mintKeypair.publicKey.toBase58()}${clusterParam}`,
  };
}

// ─── Airdrop SPL tokens to multiple addresses ─────────────────────────────────

export interface AirdropEntry { address: string; amount: string; }

export async function airdropSplTokens(params: {
  mintAddress: string;
  decimals: number;
  recipients: AirdropEntry[];
  cluster?: string;
}): Promise<string[]> {
  const { mintAddress, decimals, recipients, cluster = 'mainnet-beta' } = params;
  const rpcUrl = getRpcProxyUrl(cluster);

  if (!window.solana?.isPhantom || !window.solana.publicKey) {
    throw new Error('Phantom wallet not connected.');
  }

  const web3 = await import('@solana/web3.js');
  const spl  = await import('@solana/spl-token');

  const connection  = new web3.Connection(rpcUrl, 'confirmed');
  const payerPubkey = new web3.PublicKey(window.solana.publicKey.toBase58());
  const mintPubkey  = new web3.PublicKey(mintAddress);
  const senderAta   = await spl.getAssociatedTokenAddress(mintPubkey, payerPubkey);
  const signatures: string[] = [];

  const BATCH = 10;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new web3.Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer        = payerPubkey;

    for (const recipient of batch) {
      const destPubkey = new web3.PublicKey(recipient.address);
      const destAta    = await spl.getAssociatedTokenAddress(mintPubkey, destPubkey);
      const ataInfo    = await connection.getAccountInfo(destAta);
      if (!ataInfo) {
        tx.add(spl.createAssociatedTokenAccountInstruction(
          payerPubkey, destAta, destPubkey, mintPubkey,
        ));
      }
      const rawAmount = BigInt(Math.floor(parseFloat(recipient.amount) * 10 ** decimals));
      tx.add(spl.createTransferInstruction(senderAta, destAta, payerPubkey, rawAmount));
    }

    const signed = await window.solana.signTransaction(tx);
    const sig    = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    signatures.push(sig);
  }
  return signatures;
}

// ─── Token supply info ────────────────────────────────────────────────────────

export async function getSplMintInfo(mintAddress: string, cluster = 'mainnet-beta') {
  const rpcUrl = getRpcProxyUrl(cluster);
  const web3 = await import('@solana/web3.js');
  const spl  = await import('@solana/spl-token');
  const connection = new web3.Connection(rpcUrl, 'confirmed');
  const mint = await spl.getMint(connection, new web3.PublicKey(mintAddress));
  return {
    decimals:       mint.decimals,
    supply:         mint.supply.toString(),
    mintAuthority:  mint.mintAuthority?.toBase58()  ?? null,
    freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
    isInitialized:  mint.isInitialized,
  };
}

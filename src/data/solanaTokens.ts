

export interface SolToken {
  mint: string;        
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;  
  logoUrl?: string;
}


export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';


export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export const SOL_MAINNET_TOKENS: SolToken[] = [
  {
    mint: NATIVE_SOL_MINT,
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    isNative: true,
  },
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
  },
  {
    mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    symbol: 'ETH',
    name: 'Ethereum (Wormhole)',
    decimals: 8,
  },
  {
    mint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
    symbol: 'BTC',
    name: 'Bitcoin (Portal)',
    decimals: 6,
  },
  {
    mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    symbol: 'RAY',
    name: 'Raydium',
    decimals: 6,
  },
  {
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
  },
  {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
  },
  {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade Staked SOL',
    decimals: 9,
  },
  {
    mint: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
    symbol: 'bSOL',
    name: 'BlazeStake Staked SOL',
    decimals: 9,
  },
];


export const SOL_DEVNET_TOKENS: SolToken[] = [
  {
    mint: NATIVE_SOL_MINT,
    symbol: 'SOL',
    name: 'Devnet SOL',
    decimals: 9,
    isNative: true,
  },
  
  {
    mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    symbol: 'USDC',
    name: 'USD Coin (Devnet)',
    decimals: 6,
  },
];

export function getSolTokenList(cluster: string): SolToken[] {
  return cluster === 'devnet' ? SOL_DEVNET_TOKENS : SOL_MAINNET_TOKENS;
}

export function getSolTokenByMint(mint: string, cluster: string): SolToken | undefined {
  return getSolTokenList(cluster).find(
    t => t.mint.toLowerCase() === mint.toLowerCase(),
  );
}

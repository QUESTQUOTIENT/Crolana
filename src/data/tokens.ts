export interface Token {
  address: string; // '0x0000000000000000000000000000000000000000' for native CRO
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  isNative?: boolean;
}

// Native CRO placeholder address
export const NATIVE_CRO_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Wrapped CRO (for router paths that need ERC20)
export const WCRO_MAINNET = '0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23';
export const WCRO_TESTNET = '0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD';

// VVS Finance (Uniswap V2 fork) on Cronos
export const DEX_ROUTERS = {
  mainnet: {
    vvs: {
      name: 'VVS Finance',
      router: '0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae',
      factory: '0x3B44B2a187a7b3824131F8db5a74194D0a42Fc15',
      initCodeHash: '0xa77d3a46a9ff5fd7c6b42f3f01e0eda3e9025a8b1ae87a17a3f58e03d2c0fc96',
    },
    mm: {
      name: 'MM Finance',
      router: '0x145677FC4d9b8F19B5D56d1820c48e0443049a30',
      factory: '0xd590cC180601AEcD6eeADD9B7f2B7611519544f42',
      initCodeHash: '0x',
    },
  },
  testnet: {
    // Cronos testnet (chain 338) Uniswap V2 fork — limited liquidity by default.
    // Users can deploy their own tokens and create pools from the Liquidity Manager.
    vvs: {
      name: 'UniswapV2 (Testnet)',
      router:  '0x9553aDCf3C6b55BEE12c3C46Da4D4F2Af4b5E0f',
      factory: '0xEC7b6c44BD2d38F39520c97b066D3da1Beb80614',
      initCodeHash: '0xa77d3a46a9ff5fd7c6b42f3f01e0eda3e9025a8b1ae87a17a3f58e03d2c0fc96',
    },
  },
};

export const MAINNET_TOKENS: Token[] = [
  {
    address: NATIVE_CRO_ADDRESS,
    symbol: 'CRO',
    name: 'Cronos',
    decimals: 18,
    isNative: true,
  },
  {
    address: WCRO_MAINNET,
    symbol: 'WCRO',
    name: 'Wrapped CRO',
    decimals: 18,
  },
  {
    address: '0xc21223249CA28397B4B6541dfFaEcC539BfF0c59',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  {
    address: '0x66e428c3f67a68878562e79A0234c1F83c208770',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
  },
  {
    address: '0xF2001B145b43032AAF5Ee2884e456CCd805F677D',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
  },
  {
    address: '0xe44Fd7fCb2b1581822D0c862B68222998a0c299a',
    symbol: 'ETH',
    name: 'Ethereum (Cronos Bridge)',
    decimals: 18,
  },
  {
    address: '0x062E66477Faf219F25D27dCED647BF57C3107d52',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
  },
  {
    address: '0x2D03bECE6747ADC00E1a131BBA1469C15fD11e03',
    symbol: 'VVS',
    name: 'VVS Finance',
    decimals: 18,
  },
  {
    address: '0xDD73dEa10ABC2Bff99c60882EC5b2B81Bb1Dc5B1',
    symbol: 'TONIC',
    name: 'Tectonic',
    decimals: 18,
  },
  {
    address: '0xAdbd1231fb360047525BEdF962581F3eee7b49fe',
    symbol: 'BIFI',
    name: 'Beefy Finance',
    decimals: 18,
  },
  {
    address: '0xB888d8Dd1733d72681b30c00ee76BDE93ae7aa93',
    symbol: 'ATOM',
    name: 'Cosmos Hub (Cronos Bridge)',
    decimals: 6,
  },
];

export const TESTNET_TOKENS: Token[] = [
  {
    address: NATIVE_CRO_ADDRESS,
    symbol: 'TCRO',
    name: 'Test CRO (Native)',
    decimals: 18,
    isNative: true,
  },
  {
    address: WCRO_TESTNET,
    symbol: 'WTCRO',
    name: 'Wrapped Test CRO',
    decimals: 18,
  },
  // ──────────────────────────────────────────────────────────────────────────
  // NOTE: Cronos Testnet (chain 338) has no VVS Finance liquidity by default.
  // Workflow for testing swaps:
  //   1. Deploy an ERC-20 via Token Creator (testnet mode)
  //   2. Add liquidity: TCRO + your token in Liquidity Manager
  //   3. Use that token address in the Swap or Token Selector modal
  //
  // You can also import any custom ERC-20 address in the Token Selector modal
  // by pasting the contract address directly.
  // ──────────────────────────────────────────────────────────────────────────
];

export function getTokenList(chainId: number): Token[] {
  return chainId === 25 ? MAINNET_TOKENS : TESTNET_TOKENS;
}

export function getRouterConfig(chainId: number) {
  const cfg = chainId === 25 ? DEX_ROUTERS.mainnet.vvs : DEX_ROUTERS.testnet.vvs;
  // Attach the correct WCRO address so callers can use routerConfig.wcro directly
  return { ...cfg, wcro: getWCROAddress(chainId) };
}

export function getWCROAddress(chainId: number): string {
  return chainId === 25 ? WCRO_MAINNET : WCRO_TESTNET;
}

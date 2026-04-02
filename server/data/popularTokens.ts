

export interface PopularToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  isNative?: boolean;
  logoUrl?: string;
}

export const POPULAR_TOKENS: PopularToken[] = [
  
  {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    symbol: 'CRO',
    name: 'Cronos',
    decimals: 18,
    chainId: 25,
    isNative: true,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/info/logo.png',
  },
  {
    address: '0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23',
    symbol: 'WCRO',
    name: 'Wrapped CRO',
    decimals: 18,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23/logo.png',
  },
  {
    address: '0xc21223249ca28397b4b6541dfaeecc539bff0c59',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0xc21223249ca28397b4b6541dfaeecc539bff0c59/logo.png',
  },
  {
    address: '0x66e428c3f67a68878562e79a0234c1f83c208770',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0x66e428c3f67a68878562e79a0234c1f83c208770/logo.png',
  },
  {
    address: '0xF2001B145b43032AF5Ee2884e456CCd805F677D',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0xF2001B145b43032AF5Ee2884e456CCd805F677D/logo.png',
  },
  {
    address: '0x2D03bECE6747ADC00E1a131BBA1469C15fD11e03',
    symbol: 'VVS',
    name: 'VVS Finance',
    decimals: 18,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0x2D03bECE6747ADC00E1a131BBA1469C15fD11e03/logo.png',
  },
  {
    address: '0xDD73dEa10ABC2Bff99c60882EC5b2B81Bb1Dc5B1',
    symbol: 'TONIC',
    name: 'Tectonic',
    decimals: 18,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0xDD73dEa10ABC2Bff99c60882EC5b2B81Bb1Dc5B1/logo.png',
  },
  {
    address: '0xAdbd1231fb360047525BEdF962581F3eee7b49fe',
    symbol: 'BIFI',
    name: 'Beefy Finance',
    decimals: 18,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0xAdbd1231fb360047525BEdF962581F3eee7b49fe/logo.png',
  },
  {
    address: '0xB888d8Dd1733d72681b30c00ee76BDE93ae7aa93',
    symbol: 'ATOM',
    name: 'Cosmos Hub (Cronos Bridge)',
    decimals: 6,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0xB888d8Dd1733d72681b30c00ee76BDE93ae7aa93/logo.png',
  },
  {
    address: '0x062E66477Faf219F25D27dCED647BF57C3107d52',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: 8,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0x062E66477Faf219F25D27dCED647BF57C3107d52/logo.png',
  },
  {
    address: '0xe44Fd7fCb2b1581822D0c862B68222998a0c299a',
    symbol: 'ETH',
    name: 'Ethereum (Cronos Bridge)',
    decimals: 18,
    chainId: 25,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/assets/0xe44Fd7fCb2b1581822D0c862B68222998a0c299a/logo.png',
  },
  
  {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    symbol: 'TCRO',
    name: 'Test CRO (Native)',
    decimals: 18,
    chainId: 338,
    isNative: true,
  },
  {
    address: '0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD',
    symbol: 'WTCRO',
    name: 'Wrapped Test CRO',
    decimals: 18,
    chainId: 338,
  },
];

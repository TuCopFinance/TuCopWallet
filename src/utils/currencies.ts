export enum Currency {
  Celo = 'CELO',
  Dollar = 'USDm',
  Euro = 'EURm',
  COP = 'COPm',
  USDT = 'USDT',
  USDC = 'USDC',
  USAT = 'USAT',
}

// Maps a Currency to the token's on-chain `symbol()` return, as observed live
// on Celo mainnet. The Mento rebrand deploy on 2026-08-20 propagated to the
// backend `/api/tokens/info` at ~17:25 UTC (Statsig gate
// use_tucop_backend_tokens_info is 100%, so every install now sees the new
// shape), and the contracts `symbol()` at these addresses returns:
//   0x765de816845861e75a25fca122bb6898b8b1282a -> 'USDm' (was 'cUSD')
//   0x8a567e2aE79CA692Bd748aB832081C45de4041eA -> 'COPm' (was 'cCOP')
//   0xd8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73 -> 'EURm' (was 'cEUR', not
//     currently listed in TuCop but mapping stays honest)
// The Currency enum values (Currency.Dollar = 'USDm', Currency.Euro = 'EURm')
// were already updated in a previous rebrand and match this map 1:1.
// Historical inputs like 'cUSD' / 'cEUR' still resolve via resolveCurrency
// and resolveCICOCurrency below so deeplinks minted before the rebrand keep
// working.
export const CURRENCY_TO_CHAIN_SYMBOL: Record<Currency, string> = {
  [Currency.Celo]: 'CELO',
  [Currency.Dollar]: 'USDm',
  [Currency.Euro]: 'EURm',
  [Currency.COP]: 'COPm',
  [Currency.USDT]: 'USDT',
  [Currency.USDC]: 'USDC',
  [Currency.USAT]: 'USAT',
}

// Important: when adding new currencies, the string must match the symbol
// we use in address-metadata
export enum CiCoCurrency {
  CELO = 'CELO',
  cUSD = 'cUSD',
  COPm = 'COPm',
  USDT = 'USDT',
  USDC = 'USDC',
  USAT = 'USAT',
  cEUR = 'cEUR',
  cREAL = 'cREAL',
  ETH = 'ETH',
}

export const tokenSymbolToAnalyticsCurrency = (symbol: string): string => {
  switch (symbol) {
    case 'cREAL':
      return 'cReal'
    case 'CELO':
      return 'cGLD'
    default:
      return symbol
  }
}
export interface CurrencyInfo {
  symbol: string
  displayDecimals: number
  cashTag: string
}

type CurrencyObject = { [key in Currency]: CurrencyInfo }

export const CURRENCIES: CurrencyObject = {
  [Currency.Celo]: {
    symbol: '',
    displayDecimals: 3,
    cashTag: 'CELO',
  },
  [Currency.USDT]: {
    symbol: '$',
    displayDecimals: 2,
    cashTag: 'USDT',
  },
  [Currency.USDC]: {
    symbol: '$',
    displayDecimals: 2,
    cashTag: 'USDC',
  },
  [Currency.USAT]: {
    symbol: '$',
    displayDecimals: 2,
    cashTag: 'USAT',
  },
  [Currency.Dollar]: {
    symbol: '$',
    displayDecimals: 2,
    // Post Mento rebrand 2026-08-20 the on-chain symbol is 'USDm'.
    cashTag: 'USDm',
  },
  [Currency.COP]: {
    symbol: '$',
    displayDecimals: 2,
    cashTag: 'COPm',
  },
  [Currency.Euro]: {
    symbol: '€',
    displayDecimals: 2,
    // Post Mento rebrand 2026-08-20 the on-chain symbol is 'EURm'.
    cashTag: 'EURm',
  },
}

export function resolveCurrency(currencyCode: string): Currency | undefined {
  const mapping: Record<string, Currency | undefined> = {
    CELO: Currency.Celo,
    CGLD: Currency.Celo,
    CUSD: Currency.Dollar, // legacy on-chain symbol; still resolves to Currency.Dollar (USDm)
    USDM: Currency.Dollar,
    CEUR: Currency.Euro, // legacy on-chain symbol; still resolves to Currency.Euro (EURm)
    EURM: Currency.Euro,
    COPM: Currency.COP,
    USDT: Currency.USDT,
    USDC: Currency.USDC,
    USAT: Currency.USAT,
  }
  return mapping[currencyCode.toUpperCase()]
}

export function resolveCICOCurrency(currencyCode: string): CiCoCurrency {
  const mapping: Record<string, CiCoCurrency | undefined> = {
    CELO: CiCoCurrency.CELO,
    CGLD: CiCoCurrency.CELO,
    CUSD: CiCoCurrency.USDT, // legacy: cUSD-named code routes to USDT (kept for backwards compat)
    USDM: CiCoCurrency.USDT, // new naming; routes to USDT for CICO flows
    CEUR: CiCoCurrency.cEUR,
    EURM: CiCoCurrency.cEUR,
    CREAL: CiCoCurrency.cREAL,
    USDT: CiCoCurrency.USDT,
    USDC: CiCoCurrency.USDC,
    USAT: CiCoCurrency.USAT,
    COPM: CiCoCurrency.COPm,
  }
  return mapping[currencyCode.toUpperCase()] || CiCoCurrency.CELO
}

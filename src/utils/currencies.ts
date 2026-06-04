export enum Currency {
  Celo = 'cGLD',
  Dollar = 'cUSD',
  Euro = 'cEUR',
  COP = 'COPm',
  USDT = 'USDT',
  USDC = 'USDC',
  USAT = 'USAT',
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
    cashTag: 'cUSD',
  },
  [Currency.COP]: {
    symbol: '$',
    displayDecimals: 2,
    cashTag: 'COPm',
  },
  [Currency.Euro]: {
    symbol: '€',
    displayDecimals: 2,
    cashTag: 'cEUR',
  },
}

export function resolveCurrency(currencyCode: string): Currency | undefined {
  const mapping: Record<string, Currency | undefined> = {
    CELO: Currency.Celo,
    CGLD: Currency.Celo,
    CUSD: Currency.Dollar,
    CEUR: Currency.Euro,
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
    CEUR: CiCoCurrency.cEUR,
    CREAL: CiCoCurrency.cREAL,
    USDT: CiCoCurrency.USDT,
    USDC: CiCoCurrency.USDC,
    USAT: CiCoCurrency.USAT,
    COPM: CiCoCurrency.COPm,
  }
  return mapping[currencyCode.toUpperCase()] || CiCoCurrency.CELO
}

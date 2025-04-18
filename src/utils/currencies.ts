export enum Currency {
  Celo = 'cGLD',
  Dollar = 'cUSD',
  Euro = 'cEUR',
  COP = 'cCOP',
  USDT = 'USDT',
}

// Important: when adding new currencies, the string must match the symbol
// we use in address-metadata
export enum CiCoCurrency {
  CELO = 'CELO',
  cUSD = 'cUSD',
  cCOP = 'cCOP',
  USDT = 'USDT',
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
  [Currency.Dollar]: {
    symbol: '$',
    displayDecimals: 2,
    cashTag: 'cUSD',
  },
  [Currency.COP]: {
    symbol: '$',
    displayDecimals: 2,
    cashTag: 'cCOP',
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
    CCOP: Currency.COP,
    USDT: Currency.USDT,
  }
  return mapping[currencyCode.toUpperCase()]
}

export function resolveCICOCurrency(currencyCode: string): CiCoCurrency {
  const mapping: Record<string, CiCoCurrency | undefined> = {
    CELO: CiCoCurrency.CELO,
    CGLD: CiCoCurrency.CELO,
    CUSD: CiCoCurrency.USDT,
    CEUR: CiCoCurrency.cEUR,
    CREAL: CiCoCurrency.cREAL,
    USDT: CiCoCurrency.USDT,
    CCOP: CiCoCurrency.cCOP,
  }
  return mapping[currencyCode.toUpperCase()] || CiCoCurrency.CELO
}

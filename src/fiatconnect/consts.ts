import { CryptoType, FiatType } from '@fiatconnect/fiatconnect-types'
import { LocalCurrencyCode } from 'src/localCurrency/consts'

// Only COP and USD are supported in TuCop
export const FIATCONNECT_CURRENCY_TO_WALLET_CURRENCY: Partial<Record<FiatType, LocalCurrencyCode>> =
  {
    [FiatType.COP]: LocalCurrencyCode.COP,
    [FiatType.USD]: LocalCurrencyCode.USD,
  }

export const WALLET_CRYPTO_TO_FIATCONNECT_CRYPTO: Record<string, CryptoType | undefined> = {
  CELO: CryptoType.CELO,
  cEUR: CryptoType.cEUR,
  cUSD: CryptoType.cUSD,
  cREAL: CryptoType.cREAL,
  COPm: 'COPm',
  USDT: 'USDT',
} as any

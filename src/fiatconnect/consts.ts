import { CryptoType, FiatType } from '@fiatconnect/fiatconnect-types'
import { LocalCurrencyCode } from 'src/localCurrency/consts'

// Only COP and USD are supported in TuCop
export const FIATCONNECT_CURRENCY_TO_WALLET_CURRENCY: Partial<Record<FiatType, LocalCurrencyCode>> =
  {
    [FiatType.COP]: LocalCurrencyCode.COP,
    [FiatType.USD]: LocalCurrencyCode.USD,
  }

// Maps the wallet's internal Currency value (e.g. 'USDm', 'EURm', 'CELO') to the
// FiatConnect protocol's CryptoType (which keeps legacy 'cUSD'/'cEUR'/'cREAL'
// strings because they are an external protocol contract we don't control).
// Legacy on-chain symbols (cUSD/cEUR/cREAL) are also accepted as keys so callers
// that still pass the raw token.symbol resolve correctly.
export const WALLET_CRYPTO_TO_FIATCONNECT_CRYPTO: Record<string, CryptoType | undefined> = {
  CELO: CryptoType.CELO,
  USDm: CryptoType.cUSD,
  EURm: CryptoType.cEUR,
  cUSD: CryptoType.cUSD,
  cEUR: CryptoType.cEUR,
  cREAL: CryptoType.cREAL,
  COPm: 'COPm',
  USDT: 'USDT',
} as any

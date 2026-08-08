import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'

// XAUt0 token metadata (hardcoded since backend may not have it)
export const XAUT0_DECIMALS = 6
export const XAUT0_SYMBOL = 'XAUt0'
export const XAUT0_NAME = 'Tether Gold'

export type GoldOperationStatus = 'idle' | 'loading' | 'success' | 'error'

export type GoldIconVariant = 'bar' | 'vault'

export interface PriceAlert {
  id: string
  targetPrice: number // USD per troy ounce
  direction: 'above' | 'below'
  enabled: boolean
  createdAt: number
  triggeredAt?: number
}

export interface GoldPriceData {
  priceUsd: number // Price per troy ounce in USD
  price24hChange: number // Percentage change
  timestamp: number
  // TuCop backend price proxy responds with X-Stale: true when the value was
  // served from the 24h stale cache (upstream unreachable but a recent-ish
  // price is available). Only set on backend responses; DIA and the
  // hardcoded fallback leave both undefined.
  isStale?: boolean
  staleAgeSeconds?: number
}

export interface GoldSwapQuote {
  fromTokenId: string
  toTokenId: string
  fromAmount: string // In smallest units
  toAmount: string // In smallest units (XAUt0 for buy, COPm/USDT for sell)
  pricePerOz: string // USD price per troy ounce at quote time
  estimatedGasFee: string
  estimatedGasFeeUsd: string
  allowanceTarget: string
  preparedTransactions: SerializableTransactionRequest[]
  swapProvider?: string // Provider used for the swap (e.g., 'squid', 'uniswap')
  // Integrator fee already discounted from `price` in the swap quote, as
  // percentage 0..100. Matches src/swap/types.ts SwapTransaction shape. The
  // gold confirmation screens render this as a separate line so the user sees
  // it explicitly instead of only in the effective rate.
  appFeePercentageIncludedInPrice?: string
}

export interface GoldBuyInfo {
  fromTokenId: string
  fromAmount: string
  quote: GoldSwapQuote
}

export interface GoldSellInfo {
  toTokenId: string
  xautAmount: string
  quote: GoldSwapQuote
}

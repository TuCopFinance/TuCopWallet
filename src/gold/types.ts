import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'

// XAUt0 token metadata (hardcoded since backend may not have it)
export const XAUT0_DECIMALS = 6
export const XAUT0_SYMBOL = 'XAUt0'
export const XAUT0_NAME = 'Tether Gold'

export type GoldOperationStatus = 'idle' | 'loading' | 'success' | 'error'

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

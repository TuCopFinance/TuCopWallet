import { NeeruCategoryId } from 'src/earn/neeru/constants'

export interface NeeruPositionPayout {
  amount: string
  interest: string
  penaltyBps: number
  interestAfterPenalty: string
  total: string
  isEarly: boolean
}

export interface NeeruIndividualPosition {
  positionId: string
  category: NeeruCategoryId
  categoryLabel: string
  amount: string
  accruedInterest: string
  rateValue: string
  monthlyRatePercentage: number
  startTs: number
  endTs: number
  depositBlock: number
  depositTxHash: string
  renewedFromPositionId: string | null
  currentPayoutIfClosed: NeeruPositionPayout
  optimistic?: boolean
  staleOptimistic?: boolean
}

export interface NeeruPositionsResponse {
  address: string
  positions: NeeruIndividualPosition[]
  lastSyncedBlock: number
  lastSyncedAt: string
}

export type NeeruFetchStatus = 'idle' | 'loading' | 'success' | 'error'
export type NeeruCloseStatus = 'idle' | 'loading' | 'success' | 'error'

// Backend meta endpoint payload shape. Any type (0x-hex, structural schema)
// is preserved as-is so callers can compare against local hardcoded defaults
// byte-for-byte.
export interface NeeruMetaDataSchemaSlot {
  type: string
}

export interface NeeruMeta {
  proxyAddress: `0x${string}`
  events: {
    Deposit: {
      topic0: `0x${string}`
      dataSchema: NeeruMetaDataSchemaSlot[]
    }
  }
  errorSelectors: {
    INTEREST_POOL_LOW: `0x${string}`
    ALREADY_CLOSED: `0x${string}`
    NOT_OWNER: `0x${string}`
  }
  depositToken: {
    address: `0x${string}`
    chainId: number
    networkId: string
  }
  version: string
}

// Backend catalogue endpoint payload shape. Rates fluctuate operationally
// so wallet never persists them (see NeeruConfigState); only meta is cached.
export interface NeeruCatalogueCategory {
  id: number
  secs: string
  rateRay: string
  monthlyRatePercentage: number
  annualEffectivePercentage: number
}

export interface NeeruCatalogueToken {
  address: `0x${string}`
  decimals: number
  symbol: string
}

export interface NeeruCatalogue {
  categories: NeeruCatalogueCategory[]
  token: NeeruCatalogueToken
  fetchedAt: string
}

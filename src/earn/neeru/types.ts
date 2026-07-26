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

// Internal opaque shape for the earn-vault runtime config. The backend
// payload uses semantic names (event names, error names) that this shape
// deliberately hides: event names become positional (primary/secondary),
// error selectors become numbered (e1/e2/e3). The adapter in api.ts is the
// single boundary where semantic names appear; every other tracked file
// consumes only the opaque projection. Enforces the zero-exposure policy
// (contract surface is not reconstructible from a repo grep).
export interface NeeruMetaDataSchemaSlot {
  type: string
}

export interface NeeruMeta {
  proxyAddress: `0x${string}`
  events: {
    primary: {
      topic0: `0x${string}`
      dataSchema: NeeruMetaDataSchemaSlot[]
    }
  }
  errorSelectors: {
    e1: `0x${string}`
    e2: `0x${string}`
    e3: `0x${string}`
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

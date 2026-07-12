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

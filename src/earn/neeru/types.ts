import { NeeruCategoryId } from 'src/earn/neeru/constants'

export interface NeeruPositionPayout {
  principal: string // decimal COPm
  interest: string // decimal COPm
  penaltyBps: number
  interestAfterPenalty: string
  total: string
  isEarly: boolean
}

export interface NeeruIndividualPosition {
  positionId: string
  tranche: NeeruCategoryId
  categoryLabel: string
  principal: string
  accruedInterest: string
  rateValue: string
  monthlyRatePercentage: number
  startTs: number
  endTs: number
  depositBlock: number
  depositTxHash: string
  renewedFromPositionId: string | null
  currentPayoutIfClosed: NeeruPositionPayout
  // Optimistic-UI flags. Absent for positions sourced from the
  // backend; present on entries the wallet seeded locally after a
  // successful Deposit and before the indexer surfaces it.
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

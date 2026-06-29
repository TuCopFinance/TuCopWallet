import { NeeruTrancheId } from 'src/earn/neeru/constants'

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
  tranche: NeeruTrancheId
  trancheLabel: string
  principal: string
  accruedInterest: string
  dailyRateRay: string
  monthlyRatePercentage: number
  startTs: number
  maturityTs: number
  depositBlock: number
  depositTxHash: string
  renewedFromPositionId: string | null
  currentPayoutIfClosed: NeeruPositionPayout
}

export interface NeeruPositionsResponse {
  address: string
  positions: NeeruIndividualPosition[]
  lastSyncedBlock: number
  lastSyncedAt: string
}

export type NeeruFetchStatus = 'idle' | 'loading' | 'success' | 'error'
export type NeeruCloseStatus = 'idle' | 'loading' | 'success' | 'error'

import BigNumber from 'bignumber.js'
import { NeeruCategoryId } from 'src/earn/neeru/constants'
import {
  NeeruIndividualPosition,
  NeeruPositionPayout,
  NeeruPositionsResponse,
} from 'src/earn/neeru/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'

const NEERU_FETCH_TIMEOUT_MS = 15_000

interface RawPayout {
  amount: string
  interest: string
  penaltyBps: number
  interestAfterPenalty: string
  total: string
  isEarly: boolean
}

interface RawPosition {
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
  currentPayoutIfClosed: RawPayout
  optimistic?: boolean
  staleOptimistic?: boolean
}

interface RawResponse {
  address: string
  positions: RawPosition[]
  lastSyncedBlock: number
  lastSyncedAt: string
}

function adaptPayout(raw: RawPayout): NeeruPositionPayout {
  return {
    amount: new BigNumber(raw.amount).toFixed(),
    interest: raw.interest,
    penaltyBps: raw.penaltyBps,
    interestAfterPenalty: raw.interestAfterPenalty,
    total: raw.total,
    isEarly: raw.isEarly,
  }
}

export function adaptNeeruPosition(raw: RawPosition): NeeruIndividualPosition {
  return {
    positionId: raw.positionId,
    category: raw.category,
    categoryLabel: String(raw.categoryLabel),
    amount: new BigNumber(raw.amount).toFixed(),
    accruedInterest: raw.accruedInterest,
    rateValue: raw.rateValue,
    monthlyRatePercentage: raw.monthlyRatePercentage,
    startTs: raw.startTs,
    endTs: raw.endTs,
    depositBlock: raw.depositBlock,
    depositTxHash: raw.depositTxHash,
    renewedFromPositionId: raw.renewedFromPositionId,
    currentPayoutIfClosed: adaptPayout(raw.currentPayoutIfClosed),
    ...(raw.optimistic !== undefined && { optimistic: raw.optimistic }),
    ...(raw.staleOptimistic !== undefined && { staleOptimistic: raw.staleOptimistic }),
  }
}

export async function fetchNeeruPositions({
  baseUrl,
  walletAddress,
}: {
  baseUrl: string
  walletAddress: string
}): Promise<NeeruPositionsResponse> {
  const url = new URL('/api/earn/neeru/positions', baseUrl)
  url.searchParams.set('address', walletAddress)
  const response = await fetchWithTimeout(url.toString(), null, NEERU_FETCH_TIMEOUT_MS)
  if (!response.ok) {
    throw new Error(`fetchNeeruPositions failed: ${response.status} ${response.statusText}`)
  }
  const body = await response.json()
  const raw = body.data as RawResponse
  return {
    address: raw.address,
    positions: raw.positions.map(adaptNeeruPosition),
    lastSyncedBlock: raw.lastSyncedBlock,
    lastSyncedAt: raw.lastSyncedAt,
  }
}

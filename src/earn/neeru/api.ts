import BigNumber from 'bignumber.js'
import { NeeruCategoryId } from 'src/earn/neeru/constants'
import {
  NeeruIndividualPosition,
  NeeruPositionPayout,
  NeeruPositionsResponse,
} from 'src/earn/neeru/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'

const NEERU_FETCH_TIMEOUT_MS = 15_000

// The backend Neeru feed was renamed on the wire (principal -> amount,
// tranche -> category, categoryLabel -> categoryLabel) as part of the
// "categoria" UX cutover. The wallet's internal model keeps the old field
// names because on-chain event args (Deposit.principal, Deposit.tranche)
// are structural and cannot be renamed, and mirroring the immutable layer
// keeps the wallet-side surface consistent across the whole earn stack.
// Everything the backend produces flows through this adapter; nothing
// downstream needs to know about the wire rename.
interface RawPayout {
  amount?: string
  principal?: string
  interest: string
  penaltyBps: number
  interestAfterPenalty: string
  total: string
  isEarly: boolean
}

interface RawPosition {
  positionId: string
  category?: NeeruCategoryId
  tranche?: NeeruCategoryId
  categoryLabel?: string
  categoryLabel?: string
  amount?: string
  principal?: string
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

function pickFirst(
  ...values: Array<string | number | NeeruCategoryId | undefined>
): string | number | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v as string | number
  }
  return undefined
}

function adaptPayout(raw: RawPayout): NeeruPositionPayout {
  const principal = pickFirst(raw.amount, raw.principal)
  if (principal === undefined) {
    throw new Error('Neeru payout missing amount/principal')
  }
  return {
    principal: new BigNumber(principal).toFixed(),
    interest: raw.interest,
    penaltyBps: raw.penaltyBps,
    interestAfterPenalty: raw.interestAfterPenalty,
    total: raw.total,
    isEarly: raw.isEarly,
  }
}

export function adaptNeeruPosition(raw: RawPosition): NeeruIndividualPosition {
  const tranche = pickFirst(raw.category, raw.tranche) as NeeruCategoryId | undefined
  const categoryLabel = pickFirst(raw.categoryLabel, raw.categoryLabel)
  const principal = pickFirst(raw.amount, raw.principal)
  if (tranche === undefined || categoryLabel === undefined || principal === undefined) {
    throw new Error(
      `Neeru position missing required fields (positionId=${raw.positionId}, tranche=${tranche}, label=${categoryLabel}, principal=${principal})`
    )
  }
  return {
    positionId: raw.positionId,
    tranche,
    categoryLabel: String(categoryLabel),
    principal: new BigNumber(principal).toFixed(),
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

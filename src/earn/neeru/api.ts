import BigNumber from 'bignumber.js'
import { NeeruTrancheId } from 'src/earn/neeru/constants'
import {
  NeeruIndividualPosition,
  NeeruPositionPayout,
  NeeruPositionsResponse,
} from 'src/earn/neeru/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'

const NEERU_FETCH_TIMEOUT_MS = 15_000

// The backend Neeru feed was renamed on the wire (principal -> amount,
// tranche -> category, trancheLabel -> categoryLabel) as part of the
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
  category?: NeeruTrancheId
  tranche?: NeeruTrancheId
  categoryLabel?: string
  trancheLabel?: string
  amount?: string
  principal?: string
  accruedInterest: string
  dailyRateRay: string
  monthlyRatePercentage: number
  startTs: number
  maturityTs: number
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
  ...values: Array<string | number | NeeruTrancheId | undefined>
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
  const tranche = pickFirst(raw.category, raw.tranche) as NeeruTrancheId | undefined
  const trancheLabel = pickFirst(raw.categoryLabel, raw.trancheLabel)
  const principal = pickFirst(raw.amount, raw.principal)
  if (tranche === undefined || trancheLabel === undefined || principal === undefined) {
    throw new Error(
      `Neeru position missing required fields (positionId=${raw.positionId}, tranche=${tranche}, label=${trancheLabel}, principal=${principal})`
    )
  }
  return {
    positionId: raw.positionId,
    tranche,
    trancheLabel: String(trancheLabel),
    principal: new BigNumber(principal).toFixed(),
    accruedInterest: raw.accruedInterest,
    dailyRateRay: raw.dailyRateRay,
    monthlyRatePercentage: raw.monthlyRatePercentage,
    startTs: raw.startTs,
    maturityTs: raw.maturityTs,
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

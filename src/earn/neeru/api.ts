import BigNumber from 'bignumber.js'
import { NeeruCategoryId } from 'src/earn/neeru/constants'
import {
  NeeruCatalogue,
  NeeruIndividualPosition,
  NeeruMeta,
  NeeruPositionPayout,
  NeeruPositionsResponse,
} from 'src/earn/neeru/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'

const NEERU_FETCH_TIMEOUT_MS = 15_000
// Config endpoints (meta + catalogue) have short backend cache, so a shorter
// wallet-side timeout is enough. Falling back to hardcoded defaults is quick
// and always safe, no reason to keep the boot flow waiting.
const NEERU_CONFIG_FETCH_TIMEOUT_MS = 5_000

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

// Fetches the earn-vault meta descriptor (proxy address, event topic0, data
// schema, error selectors, deposit token identity). Backend caches 5min and
// returns the same payload byte-for-byte so wallet can compare against the
// hardcoded defaults in a CI drift check.
export async function fetchNeeruMeta({ baseUrl }: { baseUrl: string }): Promise<NeeruMeta> {
  const url = new URL('/api/meta/contracts/neeru', baseUrl)
  const response = await fetchWithTimeout(url.toString(), null, NEERU_CONFIG_FETCH_TIMEOUT_MS)
  if (!response.ok) {
    throw new Error(`fetchNeeruMeta failed: ${response.status} ${response.statusText}`)
  }
  const body = await response.json()
  return body as NeeruMeta
}

// Fetches the current catalogue of earn categories (id, lock period, rate,
// monthly + annual effective percentages) and the deposit token metadata.
// Rates fluctuate operationally (operator retunes via setTranche) so wallet
// never caches this payload past the current session.
export async function fetchNeeruCatalogue({
  baseUrl,
}: {
  baseUrl: string
}): Promise<NeeruCatalogue> {
  const url = new URL('/api/earn/neeru/catalogue', baseUrl)
  const response = await fetchWithTimeout(url.toString(), null, NEERU_CONFIG_FETCH_TIMEOUT_MS)
  if (!response.ok) {
    throw new Error(`fetchNeeruCatalogue failed: ${response.status} ${response.statusText}`)
  }
  const body = await response.json()
  const raw = body.data as NeeruCatalogue
  return raw
}

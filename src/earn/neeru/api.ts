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

// Post-2026-08-04 backend hotfix stack (their PRs #163-#166, deploy Railway
// c6205c29): warmup ticks every 20s + shared RPC client + /ready gated on
// warmup + RPC chain reordered so ankr replaces forno at head to dodge the
// Cloudflare 1015 rate-limit on the Railway egress IP.
//
// Prod trajectory:
//   pre-fix: post-idle p99 20-30s -> timeout at 15s -> AbortError toast +
//            empty state for users who actually had positions (Sentry
//            TUCOPWALLET-4 and TUCOPWALLET-D, closed 2026-08-04 by
//            temporarily bumping to 45s).
//   post-fix: consistent sub-second including post-idle (0.24s observed;
//            Sentry `errorCode:timeout` and `errorCode:circuit_open` both
//            0 in the 24h after the backend deploy).
//
// 8s covers a comfortable ~30x margin over the new baseline and still fires
// aggressively enough to protect the user from any future degradation.
// Reopen the 45s bump only if TUCOPWALLET-4/D reappear.
const NEERU_FETCH_TIMEOUT_MS = 8_000
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

// Backend meta payload shape. Kept as an internal type so the semantic
// names appear only in this file (the I/O boundary), never in downstream
// consumers. adaptNeeruMeta below projects it into the opaque NeeruMeta
// shape used everywhere else.
interface RawNeeruMetaResponse {
  proxyAddress: string
  events: Record<string, { topic0: string; dataSchema: Array<{ type: string }> }>
  errorSelectors: Record<string, string>
  depositToken: { address: string; chainId: number; networkId: string }
  version: string
}

// Adapter: projects the backend response into the opaque internal shape.
// Addresses lowercase, the primary event goes into `primary`, error selectors
// are indexed positionally (e1/e2/e3) preserving the order the backend
// enumerates them. Backend contract with wallet team is a stable enumeration
// order for errorSelectors and a single Deposit event on the primary vault.
export function adaptNeeruMeta(raw: RawNeeruMetaResponse): NeeruMeta {
  const eventKeys = Object.keys(raw.events)
  if (eventKeys.length === 0) throw new Error('fetchNeeruMeta: no events in response')
  const primaryRaw = raw.events[eventKeys[0]]
  const selectorValues = Object.values(raw.errorSelectors)
  if (selectorValues.length < 3) throw new Error('fetchNeeruMeta: fewer than 3 error selectors')
  return {
    proxyAddress: raw.proxyAddress.toLowerCase() as `0x${string}`,
    events: {
      primary: {
        topic0: primaryRaw.topic0.toLowerCase() as `0x${string}`,
        dataSchema: primaryRaw.dataSchema,
      },
    },
    errorSelectors: {
      e1: selectorValues[0].toLowerCase() as `0x${string}`,
      e2: selectorValues[1].toLowerCase() as `0x${string}`,
      e3: selectorValues[2].toLowerCase() as `0x${string}`,
    },
    depositToken: {
      address: raw.depositToken.address.toLowerCase() as `0x${string}`,
      chainId: raw.depositToken.chainId,
      networkId: raw.depositToken.networkId,
    },
    version: raw.version,
  }
}

// Fetches the earn-vault meta descriptor (proxy address, primary event
// topic0, data schema, error selectors, deposit token identity). Backend
// caches 5min. Response is adapted to the opaque internal shape so
// downstream consumers never see the backend's semantic names.
export async function fetchNeeruMeta({ baseUrl }: { baseUrl: string }): Promise<NeeruMeta> {
  const url = new URL('/api/meta/contracts/neeru', baseUrl)
  const response = await fetchWithTimeout(url.toString(), null, NEERU_CONFIG_FETCH_TIMEOUT_MS)
  if (!response.ok) {
    throw new Error(`fetchNeeruMeta failed: ${response.status} ${response.statusText}`)
  }
  const body = (await response.json()) as RawNeeruMetaResponse
  return adaptNeeruMeta(body)
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

// Backend transaction status endpoint. Backend replays eth_call at N-1
// (block before mining) against its fallback RPC chain and returns the
// revert selector. Wallet cross-checks against its own eth_call at latest
// (see enforceReceiptsOrThrow). Agreement raises confidence, disagreement
// surfaces "estado incierto" to the user.
export interface NeeruTxStatusResponse {
  status: 'success' | 'reverted'
  blockNumber?: string
  transactionHash: string
  revert?: {
    selector: string | null
    reason: string
  }
}

export async function fetchNeeruTxStatus({
  baseUrl,
  txHash,
}: {
  baseUrl: string
  txHash: string
}): Promise<NeeruTxStatusResponse> {
  const url = new URL('/api/tx/status', baseUrl)
  url.searchParams.set('hash', txHash)
  const response = await fetchWithTimeout(url.toString(), null, NEERU_CONFIG_FETCH_TIMEOUT_MS)
  if (!response.ok) {
    throw new Error(`fetchNeeruTxStatus failed: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as NeeruTxStatusResponse
}

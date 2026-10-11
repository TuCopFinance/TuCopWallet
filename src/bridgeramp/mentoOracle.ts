import { Address } from 'viem'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import { Network } from 'src/transactions/types'

const TAG = 'bridgeramp/mentoOracle'

// Bridge Ramp converts COPm <-> USDC on Mento, and the COPm/USDm exchange
// prices every swap off the SortedOracles median for this rate feed. The feed
// has a single reporter and its reports expire after 360 s; outside Colombian
// FX hours it stops reporting and the Mento Router reverts with "no valid
// median". On 2026-10-09 (a Friday) the last report landed at 15:56 Bogota and
// every COPm swap failed for the rest of the day. So before offering Bridge
// Ramp we ask the oracle itself whether it is fresh, instead of guessing from
// a fixed schedule.
export const SORTED_ORACLES_ADDRESS_CELO: Address = '0xefB84935239dAcdecF7c5bA76d8dE40b077B7b33'
export const COPM_USDM_RATE_FEED_ID: Address = '0x0196D1F4FdA21fA442e53EaF18Bf31282F6139F1'

const SORTED_ORACLES_ABI = [
  {
    name: 'medianTimestamp',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'isOldestReportExpired',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: '', type: 'bool' },
      { name: '', type: 'address' },
    ],
  },
  {
    name: 'getTokenReportExpirySeconds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'medianRate',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'numerator', type: 'uint256' },
      { name: 'denominator', type: 'uint256' },
    ],
  },
] as const

export interface CopmOracleStatus {
  // True when the Mento COPm/USDm exchange can price a swap right now.
  fresh: boolean
  // Unix seconds of the median report, 0 when the feed has never reported.
  lastReportAt: number
  // Seconds since lastReportAt, measured against `now`.
  ageSeconds: number
  // Report expiry configured on SortedOracles for this feed (360 s today).
  expirySeconds: number
  // COP per 1 USD implied by the oracle median (numerator / denominator is
  // USD per COP in 1e24 fixidity). Null when the feed has never reported.
  copPerUsd: number | null
}

export async function getCopmOracleStatus(
  now: number = Math.floor(Date.now() / 1000)
): Promise<CopmOracleStatus> {
  const client = publicClient[Network.Celo]
  const contract = { address: SORTED_ORACLES_ADDRESS_CELO, abi: SORTED_ORACLES_ABI } as const
  const [medianTimestamp, [expired], expirySeconds, [numerator, denominator]] = await Promise.all([
    client.readContract({
      ...contract,
      functionName: 'medianTimestamp',
      args: [COPM_USDM_RATE_FEED_ID],
    }),
    client.readContract({
      ...contract,
      functionName: 'isOldestReportExpired',
      args: [COPM_USDM_RATE_FEED_ID],
    }),
    client.readContract({
      ...contract,
      functionName: 'getTokenReportExpirySeconds',
      args: [COPM_USDM_RATE_FEED_ID],
    }),
    client.readContract({
      ...contract,
      functionName: 'medianRate',
      args: [COPM_USDM_RATE_FEED_ID],
    }),
  ])

  const lastReportAt = Number(medianTimestamp)
  const expiry = Number(expirySeconds)
  const ageSeconds = lastReportAt === 0 ? Number.POSITIVE_INFINITY : Math.max(0, now - lastReportAt)
  // SortedOracles only knows about the oldest report; with a single reporter
  // that is also the newest one. We still cross-check the median age so a
  // stale median with a fresh straggler cannot slip through.
  const fresh = !expired && lastReportAt > 0 && ageSeconds < expiry
  const copPerUsd = numerator === BigInt(0) ? null : Number(denominator) / Number(numerator)

  Logger.debug(TAG, 'COPm oracle status', { fresh, lastReportAt, ageSeconds, expiry, copPerUsd })
  return { fresh, lastReportAt, ageSeconds, expirySeconds: expiry, copPerUsd }
}

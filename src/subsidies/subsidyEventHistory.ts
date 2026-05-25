import Logger from 'src/utils/Logger'
import { Address } from 'viem'

import { REFI_COLOMBIA_SUBSIDIES_ADDRESS } from 'src/subsidies/ReFiColombiaSubsidiesContract'

const TAG = 'subsidies/subsidyEventHistory'

const TUCOP_BACKEND_URL = 'https://tucop-backend-production.up.railway.app'

// keccak256("SubsidyClaimed(address,uint256,uint256)") -- the real event signature
// emitted by the current ReFi Colombia subsidies contract. The previous 2-arg
// signature in the local ABI was wrong; verified on Celoscan and against a real
// claim transaction.
const SUBSIDY_CLAIMED_TOPIC = '0x00767507495bd1c757db9a339df732dd8507033a8806ece6261167c15afa3af5'

interface EventLog {
  topics?: string[]
  timeStamp?: string
  blockNumber?: string
}

const padAddressToTopic = (address: Address): string =>
  `0x${address.slice(2).toLowerCase().padStart(64, '0')}`

const parseHexTimestamp = (hex: string | undefined): number | undefined => {
  if (!hex) return undefined
  const parsed = parseInt(hex, 16)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * Returns the unix timestamp (seconds) of the most recent SubsidyClaimed event
 * for `walletAddress`, or undefined if no claim has been recorded or the lookup
 * failed. Routes through the TuCopWallet Backend proxy because the public Celo
 * RPC (Forno) rate-limits eth_getLogs and frequently rejects historical queries.
 */
export async function getLastClaimTimestamp(walletAddress: Address): Promise<number | undefined> {
  const beneficiaryTopic = padAddressToTopic(walletAddress)

  const url = new URL(`${TUCOP_BACKEND_URL}/events`)
  url.searchParams.set('address', REFI_COLOMBIA_SUBSIDIES_ADDRESS)
  url.searchParams.set('topic0', SUBSIDY_CLAIMED_TOPIC)
  // Filter server-side by beneficiary in topic[1]. The verified contract ABI declares
  // beneficiaryAddress as the only indexed param, so it lives in topic[1]. This keeps
  // the response small and avoids the Etherscan 1000-row pagination cap.
  url.searchParams.set('topic1', beneficiaryTopic)

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      Logger.warn(TAG, `Backend returned HTTP ${response.status}`)
      return undefined
    }

    const body = (await response.json()) as { events?: EventLog[] }
    const events = body.events ?? []

    const matches = events.filter((event) =>
      event.topics?.some((topic) => topic.toLowerCase() === beneficiaryTopic)
    )

    if (matches.length === 0) {
      Logger.debug(TAG, 'No claim events found for beneficiary')
      return undefined
    }

    const sorted = [...matches].sort((a, b) => {
      const aBlock = parseInt(a.blockNumber ?? '0x0', 16)
      const bBlock = parseInt(b.blockNumber ?? '0x0', 16)
      return aBlock - bBlock
    })
    const latest = sorted[sorted.length - 1]

    return parseHexTimestamp(latest.timeStamp)
  } catch (error) {
    Logger.warn(TAG, 'Failed to fetch claim history', error)
    return undefined
  }
}

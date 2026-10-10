import { useEffect, useRef, useState } from 'react'
import { CopmOracleStatus, getCopmOracleStatus } from 'src/bridgeramp/mentoOracle'
import Logger from 'src/utils/Logger'

const TAG = 'bridgeramp/useBridgeRampAvailability'

// Re-check twice per oracle expiry window so a feed that comes back during
// banking hours flips the card on within a few minutes.
const BRIDGE_RAMP_AVAILABILITY_POLL_MS = 3 * 60 * 1000

export type BridgeRampAvailability =
  | { state: 'checking' }
  | { state: 'available'; oracle: CopmOracleStatus }
  // The COPm oracle is stale: Mento cannot price a swap, so a Bridge Ramp
  // conversion would revert. The card stays visible but disabled.
  | { state: 'unavailable'; oracle: CopmOracleStatus }
  // The oracle could not be read at all (RPC down, offline). Treated like
  // unavailable so we never let the user start a flow we cannot price.
  | { state: 'error'; error: Error }

export function useBridgeRampAvailability(enabled: boolean): BridgeRampAvailability {
  const [availability, setAvailability] = useState<BridgeRampAvailability>({ state: 'checking' })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    if (!enabled) {
      return
    }

    const check = async () => {
      try {
        const oracle = await getCopmOracleStatus()
        if (!mounted.current) return
        setAvailability(
          oracle.fresh ? { state: 'available', oracle } : { state: 'unavailable', oracle }
        )
      } catch (error) {
        if (!mounted.current) return
        Logger.warn(TAG, 'Could not read the COPm oracle', error)
        setAvailability({ state: 'error', error: error as Error })
      }
    }

    // check() never throws (it catches internally), but the repo rule is to
    // always attach a catch to a floating promise.
    check().catch((error) => Logger.error(TAG, 'availability check failed', error))
    const timer = setInterval(() => {
      check().catch((error) => Logger.error(TAG, 'availability check failed', error))
    }, BRIDGE_RAMP_AVAILABILITY_POLL_MS)

    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [enabled])

  return availability
}

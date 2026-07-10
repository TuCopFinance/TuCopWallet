import { PayloadAction } from '@reduxjs/toolkit'
import { call, delay, put, select, spawn, take, takeEvery } from 'typed-redux-saga'
import { REHYDRATE, type RehydrateAction } from 'src/redux/persist-helper'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { feeCurrenciesWithPositiveBalancesSelector } from 'src/tokens/selectors'
import { Network, NetworkId } from 'src/transactions/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import { Actions as Web3Actions } from 'src/web3/actions'
import { getViemWallet } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { getConnectedUnlockedAccount } from 'src/web3/saga'
import { walletAddressSelector } from 'src/web3/selectors'
import {
  BootstrapApiError,
  postFeeAdapterBootstrap,
  type AdapterResult,
  type AdapterStatus,
  type BootstrapResponse,
} from 'src/wri/feeAdapterBootstrap/api'
import { detectShouldOfferBootstrap } from 'src/wri/feeAdapterBootstrap/detect'
import {
  bootstrapAccepted,
  bootstrapDismissed,
  bootstrapFailed,
  bootstrapSheetHidden,
  bootstrapSheetShown,
  bootstrapStarted,
  bootstrapSucceeded,
  type AdapterSymbol,
  type State as BootstrapState,
} from 'src/wri/feeAdapterBootstrap/slice'
import type { Address } from 'viem'

const TAG = 'wri/feeAdapterBootstrap/saga'

// Wait this long after boot before evaluating the bootstrap offer. Onboarding
// flows and first-render animations finish in roughly this window; firing the
// detector earlier risks fighting with the splash for screen real estate. The
// user is non-technical, so a calm UI is worth 2 seconds.
const POST_BOOT_DELAY_MS = 2_000

// Pull the slice + token balances + gate state, run the pure detector, and
// dispatch the show action if it says yes. Pulled out so the boot path and the
// SET_ACCOUNT path share one body.
export function* maybeOfferBootstrap() {
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) return

  const gateOn: boolean = yield* call(getFeatureGate, StatsigFeatureGates.WRI_COPM_FEE_BOOTSTRAP_V1)
  if (!gateOn) return

  const bootstrapState: BootstrapState = yield* select((state: any) => state.wriFeeAdapterBootstrap)

  // feeCurrenciesWithPositiveBalancesSelector returns the user's balances
  // filtered to fee-currency-eligible tokens on Celo mainnet. The detector
  // narrows further to USDC + USDT + the alt-gas tokens (CELO, USDm, COPm).
  const balances = yield* select(
    feeCurrenciesWithPositiveBalancesSelector,
    NetworkId['celo-mainnet']
  )

  const decision = detectShouldOfferBootstrap({
    balances,
    bootstrapState,
    now: Date.now(),
    gateOn,
  })

  if (decision.shouldOffer) {
    Logger.info(
      TAG,
      `offering bootstrap to ${walletAddress}: ${decision.adaptersToBootstrap.join(', ')}`
    )
    yield* put(bootstrapSheetShown({ candidates: decision.adaptersToBootstrap }))
  } else {
    Logger.debug(TAG, `skipping bootstrap offer: ${decision.reason}`)
  }
}

function* handleRehydrate(_action: RehydrateAction) {
  // Always wipe pending visibility on boot. A kill-9 mid-sheet would otherwise
  // resurrect the modal in front of a confused user.
  yield* put(bootstrapSheetHidden())
  // Pause briefly so the splash screen finishes its transition, then evaluate.
  yield* delay(POST_BOOT_DELAY_MS)
  yield* call(maybeOfferBootstrap)
}

function* handleSetAccount() {
  // SET_ACCOUNT fires once on fresh onboarding. The user has just landed on
  // home; same calm delay before showing anything.
  yield* delay(POST_BOOT_DELAY_MS)
  yield* call(maybeOfferBootstrap)
}

// Process the per-token response from the backend and update the slice.
// Backend returns 5 possible status values; the wallet treats them as:
//   approved + already_approved -> mark bootstrapped, clear errors
//   skipped_no_balance -> ignore (the user really has 0 of that token)
//   skipped_no_adapter -> log warn (should not happen in production)
//   relay_failed -> mark failed so the 24h debounce kicks in
function* applyBootstrapResults(results: AdapterResult[]) {
  for (const r of results) {
    const adapter = r.tokenSymbol as AdapterSymbol
    if (r.status === 'approved' || r.status === 'already_approved') {
      yield* put(bootstrapSucceeded({ adapter }))
      Logger.info(TAG, `${adapter} bootstrapped (${r.status}, tx=${r.txHash ?? 'none'})`)
    } else if (r.status === 'skipped_no_balance') {
      Logger.info(TAG, `${adapter} skipped: user has 0 balance`)
    } else if (r.status === 'skipped_no_adapter') {
      Logger.warn(TAG, `${adapter} skipped: backend has no env var for this adapter`)
    } else if (r.status === 'relay_failed') {
      yield* put(
        bootstrapFailed({
          adapter,
          errorMessage: `relay failed (txHash=${r.txHash ?? 'none'}); retry on next boot`,
        })
      )
    } else {
      // Defensive: backend added a new status the wallet does not know.
      Logger.warn(
        TAG,
        `${adapter} returned unknown status ${(r as { status: AdapterStatus }).status}; treating as failed`
      )
      yield* put(bootstrapFailed({ adapter, errorMessage: `unknown status ${r.status as string}` }))
    }
  }
}

// 20s covers the relay's worst-case mining + verification (backend recommends
// 20s in its delegate-relay spec). Failure here means the user stays
// non-delegated for this attempt -- the 24h debounce in the slice prevents the
// sheet from re-nagging on the next boot.
const DELEGATE_RELAY_TIMEOUT_MS = 20_000

// If the first bootstrap retry (post delegate-relay) still returns 412, wait
// this long before trying one more time. Absorbs the rare case where Forno
// load-balances the wallet's getCode read to a follower that has not yet
// caught up with the delegate mined a few hundred ms ago.
const FORNO_PROPAGATION_RETRY_MS = 1_000

// Sign an EIP-7702 authorization for the BatchExecutor and ask the backend's
// sponsored relay to submit it. Returns true when the relay confirms the EOA
// is delegated. Kept lean (single attempt, no Retry-After or 502 re-check)
// because the bootstrap sheet already has a 24h debounce -- the user is not
// repeatedly nagged on partial failure. The dollarsSpend saga keeps a richer
// retry loop because the swap flow has no such backstop.
//
// Exported so tests can shadow it via matchers.call.fn rather than mocking
// every saga effect inside (viem wallet, account unlock, fetch).
export function* signAndRelayDelegation(walletAddress: string) {
  try {
    const wallet = yield* call(getViemWallet, networkConfig.viemChain[Network.Celo])
    if (!wallet.account) {
      Logger.warn(TAG, 'delegate-relay: viem wallet has no account; cannot sign')
      return false
    }
    // Prompts the PIN if cache is cold. Same flow the dollarsSpend saga uses
    // before signing the authorization.
    yield* call(getConnectedUnlockedAccount)

    const auth = yield* call(() =>
      wallet.signAuthorization({
        account: wallet.account!,
        contractAddress: networkConfig.batchExecutorAddressCelo,
      })
    )

    // viem returns bigint chainId/nonce; backend wants hex strings (matches
    // the relay body format used by dollarsSpend/saga.ts).
    const relayBody = {
      userAddress: walletAddress,
      signedAuthorization: {
        chainId: `0x${auth.chainId.toString(16)}`,
        address: networkConfig.batchExecutorAddressCelo,
        nonce: `0x${auth.nonce.toString(16)}`,
        yParity: auth.yParity === 0 ? '0x0' : '0x1',
        r: auth.r,
        s: auth.s,
      },
    }

    const res: Response = yield* call(
      fetchWithTimeout,
      networkConfig.wriDelegateRelayUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relayBody),
      },
      DELEGATE_RELAY_TIMEOUT_MS
    )

    if (!res.ok) {
      Logger.warn(TAG, `delegate-relay returned ${res.status}; bootstrap stays blocked`)
      return false
    }

    const body = (yield* call(() => res.json())) as { status?: string }
    if (body.status === 'delegated' || body.status === 'already_delegated') {
      // Backend's delegate-relay does an internal post-mining getCode poll, so
      // when it returns "delegated" the effect is already visible on-chain.
      // No extra wait needed before the bootstrap retry.
      Logger.info(TAG, `delegate-relay confirmed ${body.status} for ${walletAddress}`)
      return true
    }
    Logger.warn(TAG, `delegate-relay returned unexpected status="${body.status ?? '<none>'}"`)

    // Defensive belt-and-suspenders: re-check on-chain in case the relay
    // gave a non-standard 200 body but the tx actually mined.
    const expectedDesignator = `0xef0100${networkConfig.batchExecutorAddressCelo
      .slice(2)
      .toLowerCase()}`
    const code = yield* call(() =>
      publicClient[Network.Celo].getCode({ address: walletAddress as Address })
    )
    return (code ?? '').toLowerCase() === expectedDesignator
  } catch (err) {
    Logger.warn(TAG, `delegate-relay threw: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

export function* handleAccept(action: PayloadAction<{ candidates: AdapterSymbol[] }>) {
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    // should not happen because the sheet only renders when address exists
    yield* put(bootstrapSheetHidden())
    return
  }

  // Mark every candidate as in-flight so the UI can show a spinner. lastError
  // gets cleared too so a previous failure does not leak into a fresh attempt.
  for (const adapter of action.payload.candidates) {
    yield* put(bootstrapStarted({ adapter }))
  }

  try {
    // First attempt of the bootstrap. The most common failure here is 412
    // (user not 7702-delegated yet); we auto-chain through delegate-relay
    // and retry once before surfacing failure to the user. Backend keeps
    // the 412 contract stable (status code + body substring "precondition
    // failed", confirmed 2026-06-30), so keying on err.kind is safe.
    let response: BootstrapResponse
    try {
      response = yield* call(postFeeAdapterBootstrap, walletAddress)
    } catch (firstErr) {
      if (firstErr instanceof BootstrapApiError && firstErr.kind === 'not-delegated') {
        Logger.info(TAG, '412 not-delegated; auto-chaining through delegate-relay')
        const delegated: boolean = yield* call(signAndRelayDelegation, walletAddress)
        if (!delegated) {
          // Surface as a non-BootstrapApiError so the outer catch dispatches
          // a plain failure message instead of treating it like another 412.
          throw new Error('delegation-failed: delegate-relay did not delegate')
        }
        // First retry. If this throws 412 too, the most likely cause is a
        // Forno LB rotation serving a follower slightly behind: the same
        // getCode singleton the backend used to confirm the delegate can
        // return stale code for a brief window. Wait 1s and try once more
        // before giving up. Expected activation: <0.1% of prod attempts.
        try {
          response = yield* call(postFeeAdapterBootstrap, walletAddress)
        } catch (retryErr) {
          if (retryErr instanceof BootstrapApiError && retryErr.kind === 'not-delegated') {
            Logger.info(
              TAG,
              '412 on first post-delegate retry; waiting 1s for Forno propagation and retrying once more'
            )
            yield* delay(FORNO_PROPAGATION_RETRY_MS)
            response = yield* call(postFeeAdapterBootstrap, walletAddress)
          } else {
            throw retryErr
          }
        }
      } else {
        throw firstErr
      }
    }
    yield* call(applyBootstrapResults, response.results)
  } catch (err) {
    if (err instanceof BootstrapApiError) {
      // Per-candidate failure so the slice records lastError for each token
      // the user was offered. The kind discriminator is logged for telemetry.
      Logger.warn(TAG, `bootstrap api error (${err.kind}): ${err.message}`)
      for (const adapter of action.payload.candidates) {
        yield* put(bootstrapFailed({ adapter, errorMessage: `${err.kind}: ${err.message}` }))
      }
    } else {
      const message = err instanceof Error ? err.message : String(err)
      Logger.warn(TAG, `bootstrap threw: ${message}`)
      for (const adapter of action.payload.candidates) {
        yield* put(bootstrapFailed({ adapter, errorMessage: message }))
      }
    }
  } finally {
    yield* put(bootstrapSheetHidden())
  }
}

export function* handleDismiss(action: PayloadAction<{ candidates: AdapterSymbol[] }>) {
  // User explicitly declined. Mark lastAttemptAt so the 24h debounce kicks in.
  // No bootstrapStarted dispatch because no API call happened; bootstrapFailed
  // with a "user dismissed" sentinel records the timestamp without polluting
  // the lastError field (we want the next attempt to start with a clean
  // error state).
  for (const adapter of action.payload.candidates) {
    yield* put(bootstrapStarted({ adapter }))
  }
  yield* put(bootstrapSheetHidden())
  Logger.info(
    TAG,
    `user dismissed bootstrap; debounce 24h on ${action.payload.candidates.join(', ')}`
  )
}

export function* watchFeeAdapterBootstrap() {
  // Boot-time evaluation: wait for the first REHYDRATE then run the detector.
  // The spawn keeps the rest of the saga responsive (takeEvery listeners
  // active) while the boot-path delay + detector pipeline runs.
  yield* spawn(function* () {
    const action = (yield* take(REHYDRATE)) as RehydrateAction
    yield* call(handleRehydrate, action)
  })

  // Onboarding evaluation: when a fresh wallet lands.
  yield* takeEvery(Web3Actions.SET_ACCOUNT, handleSetAccount)

  // Sheet handoff: the BootstrapSheetHost component dispatches these when the
  // user taps activate or later.
  yield* takeEvery(bootstrapAccepted.type, handleAccept)
  yield* takeEvery(bootstrapDismissed.type, handleDismiss)
}

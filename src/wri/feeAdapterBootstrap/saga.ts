import { PayloadAction } from '@reduxjs/toolkit'
import { call, delay, put, select, spawn, take, takeEvery } from 'typed-redux-saga'
import { REHYDRATE, type RehydrateAction } from 'src/redux/persist-helper'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { feeCurrenciesWithPositiveBalancesSelector } from 'src/tokens/selectors'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { Actions as Web3Actions } from 'src/web3/actions'
import { walletAddressSelector } from 'src/web3/selectors'
import {
  BootstrapApiError,
  postFeeAdapterBootstrap,
  type AdapterResult,
  type AdapterStatus,
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
    const response = yield* call(postFeeAdapterBootstrap, walletAddress)
    yield* call(applyBootstrapResults, response.results)
  } catch (err) {
    if (err instanceof BootstrapApiError) {
      // Per-candidate failure so the slice records lastError for each token
      // the user was offered. The kind discriminator is logged for telemetry.
      Logger.warn(TAG, `bootstrap api error (${err.kind}): ${err.message}`)
      for (const adapter of action.payload.candidates) {
        yield* put(bootstrapFailed({ adapter, errorMessage: `${err.kind}: ${err.message}` }))
      }
      // 412: user not delegated to BatchExecutor yet. The natural next step is
      // a swap (which goes through delegate-relay and mints the delegation).
      // For this iteration we just log the gap. A follow-up can chain through
      // /delegate-relay before retrying the bootstrap automatically.
      if (err.kind === 'not-delegated') {
        Logger.info(
          TAG,
          `not-delegated: user must swap once before bootstrap can work; offering will retry after debounce`
        )
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

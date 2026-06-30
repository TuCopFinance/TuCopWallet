import { call, delay, select, spawn, take, takeEvery } from 'typed-redux-saga'
import { Actions as Web3Actions } from 'src/web3/actions'
import { walletAddressSelector } from 'src/web3/selectors'
import networkConfig from 'src/web3/networkConfig'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import Logger from 'src/utils/Logger'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import { REHYDRATE, type RehydrateAction } from 'src/redux/persist-helper'

const TAG = 'transactions/registerWatchSaga'

// WRI Track C: Tell the TuCop backend indexer to start tracking this wallet's
// future transactions. The indexer keeps a Postgres row per watched address
// and persists every Celo tx that touches it; without this call the wallet
// would never receive its own atomic-7702 batches in the feed.
//
// Trigger: both REHYDRATE (existing users on every boot) AND SET_ACCOUNT (new
// users just past onboarding). Backend is idempotent, so calling repeatedly
// is fine — we get bulletproof coverage at the cost of one cheap POST per
// boot for users that are already watched.
//
// Gated: only fires when WRI_TX_FEED_TUCOP_V1 is on. There's no point asking
// the backend to track a wallet whose feed we won't be consuming. If the
// gate flips on later (during the rollout) the next boot picks it up.
//
// Failure mode: silent. The endpoint may 5xx during a backend incident; the
// next boot retries. We never alert the user — the feed itself falls back to
// Valora when the gate is off, and to the indexer's last known state when
// the gate is on, regardless of whether the watch call succeeded.

// 15 second timeout. Backend acks the watch synchronously after enqueuing the
// indexer backfill job, so this should be sub-second under normal load.
const WATCH_TIMEOUT_MS = 15_000

export function* registerWalletForFeedWatch(walletAddress: string) {
  // Re-check the gate at call time; another saga (e.g. statsig refresh) might
  // have flipped it in between the trigger fire and now.
  const gateOn: boolean = yield* call(getFeatureGate, StatsigFeatureGates.WRI_TX_FEED_TUCOP_V1)
  if (!gateOn) {
    Logger.debug(TAG, `WRI_TX_FEED_TUCOP_V1 off; skipping watch for ${walletAddress}`)
    return
  }

  try {
    const response: Response = yield* call(
      fetchWithTimeout,
      networkConfig.wriTxWatchUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      },
      WATCH_TIMEOUT_MS
    )

    if (response.ok) {
      // Backend may return { ok: true, backfillStartedAt?, backfillCompleted? }.
      // We don't gate the feed on backfillCompleted because the user can keep
      // using the wallet while the indexer catches up — Valora-shape pagination
      // covers the gap.
      Logger.info(TAG, `watch ok for ${walletAddress} (status ${response.status})`)
    } else {
      Logger.warn(
        TAG,
        `watch returned ${response.status} for ${walletAddress}; will retry on next boot`
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    Logger.warn(TAG, `watch threw for ${walletAddress}: ${message}; will retry on next boot`)
  }
}

function* handleSetAccount() {
  // SET_ACCOUNT fires on onboarding (new wallet) AND on import flow. After
  // dispatch the address is in the selector — give the reducer a tick to
  // settle so the next select() resolves to the freshly-set value.
  yield* delay(0)
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) return
  yield* call(registerWalletForFeedWatch, walletAddress)
}

function* handleRehydrate(action: RehydrateAction) {
  // The web3 slice's rehydration payload carries the persisted account; once
  // it's restored we ask the backend to keep watching. Existing users that
  // boot the app after a flag flip get covered here.
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) return
  // Spawn so failures (network, backend down) never wedge other rehydrate
  // listeners.
  yield* spawn(registerWalletForFeedWatch, walletAddress)
}

export function* watchRegisterWalletForFeed() {
  yield* takeEvery(Web3Actions.SET_ACCOUNT, handleSetAccount)
  // We can't use takeEvery for REHYDRATE because redux-persist dispatches it
  // once per persisted key; instead, wait for the first REHYDRATE then act,
  // then return. After that SET_ACCOUNT covers every state change.
  const rehydrateAction = (yield* take(REHYDRATE)) as RehydrateAction
  yield* call(handleRehydrate, rehydrateAction)
}

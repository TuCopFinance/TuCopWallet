import { createAction, PayloadAction } from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'
import { Address, Hex } from 'viem'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import {
  cancelOrder as apiCancelOrder,
  createOfframpOrder as apiCreateOfframpOrder,
  createOnrampOrder as apiCreateOnrampOrder,
  getBanks as apiGetBanks,
  getLimitsWithMeta as apiGetLimitsWithMeta,
  getMe as apiGetMe,
  getOfframpQuote as apiGetOfframpQuote,
  getOnrampQuote as apiGetOnrampQuote,
  getOrder as apiGetOrder,
  getProofUrl as apiGetProofUrl,
  getReceivingAccount as apiGetReceivingAccount,
  ListOrdersParams,
  listOrders as apiListOrders,
  ProofFile,
  ProofKind,
  TucopRampAuth,
  updateCedula as apiUpdateCedula,
  UpdateCedulaRequest,
  uploadProof as apiUploadProof,
} from 'src/tucopramp/api'
import { RootState } from 'src/redux/reducers'
import {
  limitsFetchedAtSelector,
  offrampPendingIdempotencyKeySelector,
  offrampStatusSelector,
  onrampPendingIdempotencyKeySelector,
  receivingAccountSelector,
} from 'src/tucopramp/selectors'
import {
  FlowErrorPayload,
  OFFRAMP_FINAL_STATUSES,
  OfframpFlowStatus,
  ONRAMP_FINAL_STATUSES,
  OnrampFlowStatus,
  cedulaUpdateFailed,
  cedulaUpdateSucceeded,
  cedulaUpdating,
  limitsBackgroundRevalidateFinished,
  limitsBackgroundRevalidateStarted,
  limitsFetched,
  LastOfframpPayout,
  offrampActiveCheckFailed,
  offrampActiveCheckStarted,
  offrampActiveResumed,
  offrampAdvance,
  offrampCancelling,
  offrampCreatingOrder,
  offrampDepositBroadcast,
  offrampDepositFailed,
  offrampDepositSubmitting,
  offrampError,
  offrampNoActiveFound,
  offrampOrderCreated,
  offrampPendingIdempotencyKeyCleared,
  offrampPollTimedOut,
  offrampProofUrlFailed,
  offrampProofUrlLoaded,
  offrampProofUrlLoading,
  offrampQuoteReady,
  offrampQuoting,
  offrampSavePayoutProfile,
  onrampActiveCheckFailed,
  onrampActiveCheckStarted,
  onrampActiveResumed,
  onrampAdvance,
  onrampCancelling,
  onrampCreatingOrder,
  onrampError,
  onrampNoActiveFound,
  onrampOrderCreated,
  onrampPendingIdempotencyKeyCleared,
  onrampPollTimedOut,
  onrampProofRejectedForRetry,
  onrampProofUploaded,
  onrampProofUploadFailed,
  onrampQuoteReady,
  onrampQuoting,
  onrampUploadingProof,
  setBanks,
  setReceivingAccount,
  setUserProfile,
} from 'src/tucopramp/slice'
import { publicClient } from 'src/viem'
import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import { BaseStandbyTransaction } from 'src/transactions/slice'
import { NetworkId, TokenTransactionTypeV2, newTransactionContext } from 'src/transactions/types'
import { networkIdToNetwork, COPM_TOKEN_ID_MAINNET } from 'src/web3/networkConfig'
import {
  OfframpOrderRequest,
  OfframpOrderStatus,
  OfframpQuoteRequest,
  OnrampOrderRequest,
  OnrampOrderResponse,
  OnrampOrderStatus,
  OnrampQuoteRequest,
  QuoteResponse,
  TucopRampError,
} from 'src/tucopramp/types'
import Logger from 'src/utils/Logger'
import { getKeychainAccounts } from 'src/web3/contracts'
import { KeychainAccounts } from 'src/web3/KeychainAccounts'
import { walletAddressSelector } from 'src/web3/selectors'
import {
  call,
  delay,
  fork,
  put,
  race,
  select,
  take,
  takeLatest,
  takeLeading,
} from 'typed-redux-saga'

const TAG = 'tucopramp/saga'

// Poll cadence. Operators settle by hand and can take up to 24 h, so the
// poller backs off instead of giving up after a few minutes: 15 s for the
// first 2 min, 30 s up to 10 min, 60 s up to 30 min, then every 5 min. Never
// faster than 30 s once the operator has the order. After 24 h of polling
// the flow moves to `poll-timeout`, where the user can refresh by hand. The
// screen stops the poller on close (stop*Polling) and re-polls when the app
// returns to the foreground.
const POLL_SCHEDULE: ReadonlyArray<{ untilMs: number; delayMs: number }> = [
  { untilMs: 2 * 60_000, delayMs: 15_000 },
  { untilMs: 10 * 60_000, delayMs: 30_000 },
  { untilMs: 30 * 60_000, delayMs: 60_000 },
]
const POLL_MAX_DELAY_MS = 5 * 60_000
const POLL_OPERATOR_ACTIVE_MIN_DELAY_MS = 30_000
export const POLL_GIVE_UP_AFTER_MS = 24 * 60 * 60_000

export function pollDelayMs(elapsedMs: number, operatorActive: boolean): number {
  const step = POLL_SCHEDULE.find((s) => elapsedMs < s.untilMs)
  const base = step ? step.delayMs : POLL_MAX_DELAY_MS
  return operatorActive ? Math.max(base, POLL_OPERATOR_ACTIVE_MIN_DELAY_MS) : base
}

// GET /v1/p2p/limits is cached client-side per guide sec 10 (server also
// advertises Cache-Control: max-age=300). We skip refetching within this
// window even on explicit refresh triggers so Ops config bumps propagate on
// the next natural cold-cache boot rather than on every screen open.
const LIMITS_CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12h

// Actions the UI dispatches (typed via Redux Toolkit's createAction).

export const fetchBanks = createAction('tucopramp/fetchBanks')
export const fetchReceivingAccount = createAction('tucopramp/fetchReceivingAccount')
export const fetchUserProfile = createAction('tucopramp/fetchUserProfile')
export const fetchLimits = createAction('tucopramp/fetchLimits')
export const submitCedulaUpdate = createAction<UpdateCedulaRequest>('tucopramp/submitCedulaUpdate')

export const requestOfframpQuote = createAction<OfframpQuoteRequest>(
  'tucopramp/requestOfframpQuote'
)
export const submitOfframpOrder = createAction<{
  body: OfframpOrderRequest
  idempotencyKey?: string
}>('tucopramp/submitOfframpOrder')
export const pollOfframpOrder = createAction<{ orderId: string }>('tucopramp/pollOfframpOrder')
// Dispatched by the screen on close: cancels the running off-ramp poller.
export const stopOfframpPolling = createAction('tucopramp/stopOfframpPolling')
export const cancelOfframpOrder = createAction<{ orderId: string; idempotencyKey?: string }>(
  'tucopramp/cancelOfframpOrder'
)
export const fetchOfframpProofUrl = createAction<{ orderId: string; kind: ProofKind }>(
  'tucopramp/fetchOfframpProofUrl'
)
// The on-chain COPm transfer from the user's wallet to the offramp multisig.
// Broadcast happens inside the wallet (sendPreparedTransactions primitive);
// the server detects the deposit on-chain via its own watcher, no
// wallet-side POST of the tx hash is required. Kept as a takeLeading action
// so a stray double-tap can't broadcast twice.
export const sendOfframpDeposit = createAction<{
  orderId: string
  multisigAddress: string
  amountCopm: number
  serializablePreparedTransaction: SerializableTransactionRequest
}>('tucopramp/sendOfframpDeposit')
// Fetches the wallet's recent offramp orders on screen mount to enforce the
// "one active order at a time" invariant. If an active order is found, resumes
// its flow; otherwise reads the most recent completed order's payout details
// so the fresh form can prefill bank_code/type/bre_b_key without asking again.
export const checkActiveOfframpOrder = createAction('tucopramp/checkActiveOfframpOrder')

export const requestOnrampQuote = createAction<OnrampQuoteRequest>('tucopramp/requestOnrampQuote')
export const submitOnrampOrder = createAction<{
  body: OnrampOrderRequest
  idempotencyKey?: string
}>('tucopramp/submitOnrampOrder')
export const uploadOnrampProof = createAction<{ orderId: string; file: ProofFile }>(
  'tucopramp/uploadOnrampProof'
)
export const pollOnrampOrder = createAction<{ orderId: string }>('tucopramp/pollOnrampOrder')
export const stopOnrampPolling = createAction('tucopramp/stopOnrampPolling')
// On-ramp counterpart of checkActiveOfframpOrder: resumes an open on-ramp
// order (AWAITING_PROOF / AWAITING_REVIEW / VERIFYING) on screen mount.
export const checkActiveOnrampOrder = createAction('tucopramp/checkActiveOnrampOrder')
export const cancelOnrampOrder = createAction<{ orderId: string; idempotencyKey?: string }>(
  'tucopramp/cancelOnrampOrder'
)

// Terminal state predicates shared with pollers.
function isOfframpTerminal(status: OfframpOrderStatus): boolean {
  return (
    status === 'COMPLETED' ||
    status === 'CANCELLED' ||
    status === 'EXPIRED' ||
    status === 'REFUNDED'
  )
}

function isOnrampTerminal(status: OnrampOrderStatus): boolean {
  return (
    status === 'COMPLETED' ||
    status === 'REJECTED' ||
    status === 'CANCELLED' ||
    status === 'EXPIRED'
  )
}

// A local status the poller must not overwrite with a non-final server
// status: a cancel in flight, or a final state already reached (a stale
// response that was in flight while the order ended).
function isOfframpLocallySettled(status: OfframpFlowStatus): boolean {
  return status === 'cancelling' || OFFRAMP_FINAL_STATUSES.includes(status)
}

function isOnrampLocallySettled(status: OnrampFlowStatus): boolean {
  return status === 'cancelling' || ONRAMP_FINAL_STATUSES.includes(status)
}

// Stable fingerprint of an order request, used to decide whether a submit is
// a retry of the pending request (reuse its Idempotency-Key) or a new one.
// quote_id is left out: a retry after the quote expired is still the same
// request. Two 32-bit string hashes, so no personal data is persisted.
export function orderRequestFingerprint(body: OfframpOrderRequest | OnrampOrderRequest): string {
  const { quote_id: _quoteId, ...rest } = body as Record<string, unknown>
  const canonical = JSON.stringify(
    Object.keys(rest)
      .sort()
      .map((k) => [k, rest[k] ?? null])
  )
  let djb2 = 5381
  let sdbm = 0
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical.charCodeAt(i)
    djb2 = ((djb2 << 5) + djb2 + c) | 0
    sdbm = (c + (sdbm << 6) + (sdbm << 16) - sdbm) | 0
  }
  return `${(djb2 >>> 0).toString(16)}${(sdbm >>> 0).toString(16)}`
}

// Auth context resolver. Reused by every wallet-scoped saga. Return typing is
// inferred by typed-redux-saga; do NOT add an explicit Generator<...> annotation
// or `yield* call(resolveAuth)` will collapse to `unknown` at callsites.
function* resolveAuth() {
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    Logger.warn(TAG, 'no wallet address in redux, cannot make signed request')
    return null
  }
  const keychainAccounts: KeychainAccounts = yield* call(getKeychainAccounts)
  const auth: TucopRampAuth = {
    walletAddress: walletAddress as Address,
    keychainAccounts,
  }
  return auth
}

// ---------- Reference data ----------

export function* fetchBanksSaga() {
  try {
    const banks = yield* call(apiGetBanks)
    yield* put(setBanks(banks))
  } catch (err) {
    Logger.warn(TAG, 'fetchBanks failed', err)
  }
}

export function* fetchReceivingAccountSaga() {
  try {
    const account = yield* call(apiGetReceivingAccount)
    yield* put(setReceivingAccount(account))
  } catch (err) {
    Logger.warn(TAG, 'fetchReceivingAccount failed', err)
  }
}

export function* fetchUserProfileSaga() {
  const auth = yield* call(resolveAuth)
  if (!auth) return
  try {
    const me = yield* call(apiGetMe, auth)
    yield* put(setUserProfile(me))
  } catch (err) {
    // 404 wallet_not_linked is expected on first-time users; not an error.
    if (err instanceof TucopRampError && err.code === 'wallet_not_linked') {
      Logger.info(TAG, 'wallet not linked yet (first-time user)')
      return
    }
    Logger.warn(TAG, 'fetchUserProfile failed', err)
  }
}

// Cedula self-correction via PATCH /v1/p2p/users/cedula. Backend rejects with
// 409 cedula_locked_by_active_order when any non-terminal order references the
// current cedula; the settings screen SHOULD prevent submission in that state
// but the saga also surfaces the code via cedulaUpdateFailed so the UI stays
// truthful if the state changed between load + submit.
export function* submitCedulaUpdateSaga(action: PayloadAction<UpdateCedulaRequest>) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(cedulaUpdateFailed({ code: 'no_wallet' }))
    return
  }
  yield* put(cedulaUpdating())
  try {
    yield* call(apiUpdateCedula, auth, action.payload)
    // Success: re-fetch profile so cedula_last_4 refreshes across the UI.
    // Any listener reading userProfileSelector will see the new value on
    // the next selector tick without any imperative sync.
    yield* call(fetchUserProfileSaga)
    yield* put(cedulaUpdateSucceeded())
  } catch (err) {
    yield* put(cedulaUpdateFailed({ code: errorCode(err) }))
  }
}

// Runtime operational caps from GET /v1/p2p/limits with a 3-tier staleness
// gate honoring both the server's Cache-Control: max-age hint AND the
// wallet's hard 12h upper bound.
//
//   age < serverMaxAge    -> fresh, skip fetch
//   age < LIMITS_CACHE_TTL_MS -> stale, fire background revalidate (SWR)
//   age >= LIMITS_CACHE_TTL_MS -> beyond hard TTL, foreground fetch
//
// Server sends max-age=300 today (guide sec 10). If the server ever bumps
// this, we automatically respect the new value per-response — no wallet
// release needed. Falls back to a 5min default when the header is missing
// so a temporary server misconfiguration does not extend the fresh window
// indefinitely. On any failure the hardcoded fallback in limits.ts keeps
// the UI working; we still report via captureBusinessError so persistent
// server-side outages surface on the dashboard.
const DEFAULT_SERVER_MAX_AGE_MS = 5 * 60 * 1000 // 5min, matches current server config

export function* fetchLimitsSaga() {
  const fetchedAt = yield* select(limitsFetchedAtSelector)
  const serverMaxAgeMs = yield* select((s: RootState) => s.tucopramp.limits.serverMaxAgeMs)
  const bgInFlight = yield* select(
    (s: RootState) => s.tucopramp.limits.backgroundRevalidateInFlight
  )
  const now = Date.now()
  const effectiveMaxAge = serverMaxAgeMs ?? DEFAULT_SERVER_MAX_AGE_MS

  if (fetchedAt !== null) {
    const age = now - fetchedAt
    if (age < effectiveMaxAge) {
      return // fresh, skip
    }
    if (age < LIMITS_CACHE_TTL_MS) {
      // Stale-while-revalidate: user still sees the cached value; refresh in
      // the background. Guard against overlapping revalidations.
      if (bgInFlight) return
      yield* put(limitsBackgroundRevalidateStarted())
      try {
        const { value, serverMaxAgeMs: freshMaxAge } = yield* call(apiGetLimitsWithMeta)
        yield* put(
          limitsFetched({
            value,
            fetchedAt: Date.now(),
            serverMaxAgeMs: freshMaxAge,
          })
        )
      } catch (err) {
        Logger.warn(TAG, 'fetchLimits background revalidate failed', err)
        yield* put(limitsBackgroundRevalidateFinished())
        captureBusinessError(err, {
          feature: 'tucopramp',
          provider: 'internal',
          action: 'get_limits',
        })
      }
      return
    }
  }

  // Cold cache or beyond hard TTL: foreground fetch.
  try {
    const { value, serverMaxAgeMs: freshMaxAge } = yield* call(apiGetLimitsWithMeta)
    yield* put(
      limitsFetched({
        value,
        fetchedAt: Date.now(),
        serverMaxAgeMs: freshMaxAge,
      })
    )
  } catch (err) {
    Logger.warn(TAG, 'fetchLimits failed, keeping hardcoded fallback', err)
    captureBusinessError(err, {
      feature: 'tucopramp',
      provider: 'ramp',
      action: 'get_limits',
    })
  }
}

// ---------- Off-ramp ----------

export function* requestOfframpQuoteSaga(action: PayloadAction<OfframpQuoteRequest>) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(offrampError({ code: 'no_wallet' }))
    return
  }
  const previousQuote = yield* select((s: RootState) => s.tucopramp.offramp.lastQuote)
  yield* put(offrampQuoting())
  try {
    const quote = yield* call(apiGetOfframpQuote, auth, action.payload)
    yield* put(offrampQuoteReady(quote))
  } catch (err) {
    yield* put(offrampError(errorMeta(err, previousQuote)))
    reportTucoprampError(err, 'offramp_quote')
  }
}

export function* submitOfframpOrderSaga(
  action: PayloadAction<{ body: OfframpOrderRequest; idempotencyKey?: string }>
) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(offrampError({ code: 'no_wallet' }))
    return
  }
  // Guard: if the slice's last quote has already expired, refetch silently
  // and swap the quote_id on the outgoing body. The UI flips to `quoting`
  // for the brief window while we re-quote, then resumes creating the order.
  // Malformed / missing expires_at falls through (isFinite guard); the server
  // will 400 on a stale quote_id and the caller will see the specific code.
  const bodyWithFreshQuote = yield* call(ensureFreshOfframpQuote, auth, action.payload.body)
  if (bodyWithFreshQuote === null) return // refetch failed, error already dispatched

  // Idempotency-Key precedence: caller-provided > previously persisted key
  // of the SAME request (mid-createOrder crash / timeout retry) > fresh UUID
  // for a new intent. The persisted key survives reset and cold boot, so a
  // retry reuses the same header and the server dedups instead of creating a
  // duplicate real-money order. Cleared on order confirmation. A pending key
  // without a fingerprint (persisted by an older build) is reused as before.
  const fingerprint = orderRequestFingerprint(bodyWithFreshQuote)
  const persistedKey = yield* select(offrampPendingIdempotencyKeySelector)
  const persistedFingerprint = yield* select(
    (s: RootState) => s.tucopramp.offramp.pendingRequestFingerprint
  )
  const reusableKey =
    persistedKey && (!persistedFingerprint || persistedFingerprint === fingerprint)
      ? persistedKey
      : null
  const idempotencyKey = action.payload.idempotencyKey ?? reusableKey ?? uuidv4()
  const previousQuote = yield* select((s: RootState) => s.tucopramp.offramp.lastQuote)
  yield* put(offrampCreatingOrder({ idempotencyKey, fingerprint }))
  try {
    const order = yield* call(apiCreateOfframpOrder, auth, bodyWithFreshQuote, idempotencyKey)
    yield* put(offrampOrderCreated(order))
    // Persist the destination-keyed payout profile so a future order that
    // targets the same Bre-B key or bank account can prefill the personal
    // info (name, cedula, email) tied to THIS specific destination. The
    // server never exposes per-order personal info on wallet-facing
    // endpoints, so this local cache is the only source of truth for the
    // "one wallet, many beneficiaries" case.
    yield* put(
      offrampSavePayoutProfile({
        method: bodyWithFreshQuote.payout_method,
        bre_b_key:
          bodyWithFreshQuote.payout_method === 'bre_b_key'
            ? (bodyWithFreshQuote.bre_b_key ?? null)
            : null,
        bank_code:
          bodyWithFreshQuote.payout_method === 'bank_account'
            ? (bodyWithFreshQuote.bank_code ?? null)
            : null,
        bank_account_type:
          bodyWithFreshQuote.payout_method === 'bank_account'
            ? (bodyWithFreshQuote.bank_account_type ?? null)
            : null,
        bank_account_number:
          bodyWithFreshQuote.payout_method === 'bank_account'
            ? (bodyWithFreshQuote.bank_account_number ?? null)
            : null,
        full_name: bodyWithFreshQuote.full_name,
        cedula: bodyWithFreshQuote.cedula,
        email: bodyWithFreshQuote.email ?? '',
        lastUsedAt: Date.now(),
      })
    )
  } catch (err) {
    if (errorCode(err) === 'idempotency_key_reuse') {
      // The key was already used for a different body: an earlier attempt
      // of this request reached the server (e.g. it timed out on our side).
      // Drop the key and look for the order that attempt may have created;
      // if there is one, the check resumes it instead of erroring.
      yield* put(offrampPendingIdempotencyKeyCleared())
      yield* call(checkActiveOfframpOrderSaga)
      const resumedId = yield* select((s: RootState) => s.tucopramp.offramp.activeOrderId)
      if (resumedId) return
    }
    yield* put(offrampError(errorMeta(err, previousQuote)))
    reportTucoprampError(err, 'offramp_submit_order')
  }
}

// If the last observed quote for this flow has an expires_at in the past,
// re-fetch a fresh quote from the same params and return the body with the
// new quote_id spliced in. Returns null when refetch failed and an error was
// already dispatched, in which case the caller must abort.
function* ensureFreshOfframpQuote(auth: TucopRampAuth, body: OfframpOrderRequest) {
  const lastQuote = yield* select((s) => s.tucopramp.offramp.lastQuote)
  if (!lastQuote || !lastQuote.expires_at || lastQuote.quote_id !== body.quote_id) {
    return body
  }
  const expiresAtMs = new Date(lastQuote.expires_at).getTime()
  if (!isFinite(expiresAtMs) || Date.now() <= expiresAtMs) {
    return body
  }
  Logger.info(TAG, 'offramp quote expired, refetching before submit')
  yield* put(offrampQuoting())
  try {
    const quoteRequest: OfframpQuoteRequest = {
      gross_amount_cop: body.gross_amount_cop,
      payout_method: body.payout_method,
      bank_code: body.bank_code,
      bank_account_type: body.bank_account_type,
      cedula: body.cedula,
      // Propagate document_type so the refetched quote pins to the same
      // (type, number) identity the caller submitted; missing = server
      // default to 'CC' which would mis-price a CE / TI / PAS user.
      document_type: body.document_type,
    }
    const fresh = yield* call(apiGetOfframpQuote, auth, quoteRequest)
    yield* put(offrampQuoteReady(fresh))
    return { ...body, quote_id: fresh.quote_id }
  } catch (err) {
    yield* put(offrampError(errorMeta(err)))
    reportTucoprampError(err, 'offramp_refetch_quote')
    return null
  }
}

// True while the screen still tracks this order (local order or resumed
// active order). Lets a poller that outlived its order stop instead of
// writing a stale status into a reset flow.
function* isOfframpOrderTracked(orderId: string) {
  const offramp = yield* select((s: RootState) => s.tucopramp.offramp)
  return offramp.currentOrder?.order_id === orderId || offramp.activeOrderId === orderId
}

export function* pollOfframpOrderSaga(action: PayloadAction<{ orderId: string }>) {
  const { orderId } = action.payload
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(offrampError({ code: 'no_wallet' }))
    return
  }
  let elapsedMs = 0
  let operatorActive = false
  while (elapsedMs < POLL_GIVE_UP_AFTER_MS) {
    try {
      const detail = yield* call(apiGetOrder, auth, orderId)
      if (!(yield* call(isOfframpOrderTracked, orderId))) {
        Logger.info(TAG, `pollOfframpOrder: order ${orderId} no longer tracked, stopping`)
        return
      }
      const status = detail.status as OfframpOrderStatus
      const mapped = mapOfframpDetailStatus(status)
      const terminal = isOfframpTerminal(status)
      const localStatus = yield* select(offrampStatusSelector)
      if (mapped && (terminal || !isOfframpLocallySettled(localStatus))) {
        yield* put(offrampAdvance({ status: mapped }))
      }
      if (terminal) return
      operatorActive = status === 'DEPOSIT_CONFIRMED' || status === 'PROCESSING'
    } catch (err) {
      Logger.warn(TAG, 'pollOfframpOrder failed, will retry', err)
    }
    const delayMs = pollDelayMs(elapsedMs, operatorActive)
    yield* delay(delayMs)
    elapsedMs += delayMs
  }
  Logger.warn(TAG, `pollOfframpOrder gave up after ${POLL_GIVE_UP_AFTER_MS} ms`)
  if (yield* call(isOfframpOrderTracked, orderId)) {
    yield* put(offrampPollTimedOut())
  }
}

// takeLatest worker: a new poll replaces the running one, and the screen's
// stopOfframpPolling (on close) cancels it.
function* pollOfframpOrderUntilStopped(action: PayloadAction<{ orderId: string }>) {
  yield* race({
    poll: call(pollOfframpOrderSaga, action),
    stop: take(stopOfframpPolling.type),
  })
}

// Broadcast the on-chain COPm transfer to the offramp multisig, keeping the
// user on the offramp screen and storing the tx hash in the offramp slice.
// Deliberately does NOT reuse src/send/saga.ts sendPaymentSaga because that
// one navigates to TransactionSuccessScreen on success, which would drop the
// user out of the offramp flow and lose the poll + proof state.
export function* sendOfframpDepositSaga(
  action: PayloadAction<{
    orderId: string
    multisigAddress: string
    amountCopm: number
    serializablePreparedTransaction: SerializableTransactionRequest
  }>
) {
  const { orderId, multisigAddress, amountCopm, serializablePreparedTransaction } = action.payload
  yield* put(offrampDepositSubmitting())
  const networkId = NetworkId['celo-mainnet']
  let hash: Hex
  try {
    const context = newTransactionContext(TAG, `Offramp deposit ${orderId}`)
    const createStandbyTransaction = (
      transactionHash: string,
      feeCurrencyId?: string
    ): BaseStandbyTransaction => ({
      type: TokenTransactionTypeV2.Sent,
      context,
      networkId,
      amount: {
        // Negated because from the wallet's ledger POV this is an outflow.
        value: `-${amountCopm}`,
        tokenId: COPM_TOKEN_ID_MAINNET,
      },
      address: multisigAddress,
      metadata: {},
      transactionHash,
      feeCurrencyId,
    })
    const [sent] = yield* call(
      sendPreparedTransactions,
      [serializablePreparedTransaction],
      networkId,
      [createStandbyTransaction],
      false,
      `offramp-deposit-${orderId}`
    )
    hash = sent
  } catch (err) {
    Logger.warn(TAG, 'sendOfframpDeposit failed', err)
    yield* put(offrampDepositFailed({ code: 'broadcast_failed' }))
    captureBusinessError(err instanceof Error ? err : new Error(String(err)), {
      feature: 'tucopramp',
      provider: 'internal',
      action: 'deposit_broadcast_failed',
      extra: { orderId },
    })
    return
  }
  yield* put(offrampDepositBroadcast({ txHash: hash }))
  // Wait for on-chain confirmation so we surface a revert to the user
  // instead of silently sitting on the awaiting-deposit screen. The
  // pollOfframpOrder saga already handles the server-side transition once
  // the deposit lands; this receipt wait is purely a client-side guard.
  // Once the tx is broadcast, a failure of the wait itself (RPC timeout,
  // network) is NOT a failed deposit: the tx may well land, so the flow
  // stays `submitted` and the poller confirms it. Only a mined revert fails.
  try {
    const receipt = yield* call(
      [publicClient[networkIdToNetwork[networkId]], 'waitForTransactionReceipt'],
      { hash }
    )
    if (receipt.status === 'reverted') {
      Logger.warn(TAG, `Offramp deposit tx reverted: ${hash}`)
      yield* put(offrampDepositFailed({ code: 'reverted' }))
      captureBusinessError(new Error(`Offramp deposit reverted: ${hash}`), {
        feature: 'tucopramp',
        provider: 'internal',
        action: 'deposit_reverted',
        extra: { orderId },
      })
    }
  } catch (err) {
    Logger.warn(TAG, `Offramp deposit receipt wait failed for ${hash}, relying on polling`, err)
  }
}

// On offramp screen mount: fetch recent orders from the server to enforce
// the "one active order at a time" invariant. If one is found, resume its
// flow (blocks the fresh-form path). Otherwise, look up the most recent
// completed order's payout details and cache them for auto-fill.
//
// The server-facing GET /v1/p2p/orders/{id} response does NOT include the
// deposit multisig_address, so if the local slice was wiped (cold boot,
// reinstall) and the server has an AWAITING_DEPOSIT order for us, we cannot
// recover the multisig to broadcast the deposit ourselves. The UI in that
// case surfaces a cancel-only path.
export function* checkActiveOfframpOrderSaga() {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(offrampActiveCheckFailed())
    return
  }
  yield* put(offrampActiveCheckStarted())
  try {
    // Ask for a small window: the server orders newest-first per the guide,
    // and the invariant is one active order, so 10 is generous enough to
    // find both an active order (if any) and the most recent completed one
    // for the prefill cache.
    const params: ListOrdersParams = { type: 'offramp', limit: 10 }
    const page = yield* call(apiListOrders, auth, params)
    const summaries = page.orders ?? []
    // Server status enums are uppercase; match to activity buckets.
    const activeSummary = summaries.find(
      (o) =>
        o.status === 'AWAITING_DEPOSIT' ||
        o.status === 'DEPOSIT_CONFIRMED' ||
        o.status === 'PROCESSING'
    )
    if (activeSummary) {
      const detail = yield* call(apiGetOrder, auth, activeSummary.id)
      // Check the local slice - if we still have currentOrder for this exact
      // orderId (kept across leaving the screen), its multisig_address and
      // deposit tx state are authoritative. Otherwise, past AWAITING_DEPOSIT
      // the UI renders from the detail; in AWAITING_DEPOSIT the server has an
      // order we can't broadcast for anymore.
      const localCurrent = yield* select((s: RootState) => s.tucopramp.offramp.currentOrder)
      const localMatches = !!localCurrent && localCurrent.order_id === activeSummary.id
      const status =
        mapOfframpDetailStatus(detail.status as OfframpOrderStatus) ??
        mapOfframpDetailStatus(activeSummary.status as OfframpOrderStatus) ??
        'processing'
      yield* put(
        offrampActiveResumed({
          detail,
          currentOrder: localMatches ? localCurrent : null,
          status,
        })
      )
      return
    }
    // No active order - fetch the most recent COMPLETED order's detail to
    // grab its payout section and stash it as the prefill cache. Falls
    // through with null if there is no completed order yet.
    const lastCompleted = summaries.find((o) => o.status === 'COMPLETED')
    let lastPayout: LastOfframpPayout | null = null
    if (lastCompleted) {
      try {
        const detail = yield* call(apiGetOrder, auth, lastCompleted.id)
        if (detail.payout) {
          lastPayout = {
            method: detail.payout.method,
            bank_code: detail.payout.bank_code ?? null,
            bank_account_type: detail.payout.bank_account_type ?? null,
            bank_account_number_last_4: detail.payout.bank_account_number_last_4 ?? null,
            bre_b_key: detail.payout.bre_b_key ?? null,
          }
        }
      } catch (err) {
        // Non-fatal: prefill is a UX nicety, not required for the fresh form.
        Logger.warn(TAG, 'lastCompleted detail fetch failed', err)
      }
    }
    yield* put(offrampNoActiveFound({ lastPayout }))
  } catch (err) {
    Logger.warn(TAG, 'checkActiveOfframpOrder failed', err)
    yield* put(offrampActiveCheckFailed())
  }
}

// Fetch the short-lived HMAC-signed URL for a proof (operator_outgoing on
// COMPLETED offramp orders, or user_incoming on onramp). Server returns
// { url, expires_at } with a 300 s TTL. Consumer opens the URL directly in
// an Image / WebView / PDF viewer; the URL is public + HMAC-gated so no
// wallet-auth headers are needed on the follow-up fetch of the file bytes.
// If the URL expires while the user is still on the screen, dispatch this
// action again to pull a fresh one.
export function* fetchOfframpProofUrlSaga(
  action: PayloadAction<{ orderId: string; kind: ProofKind }>
) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(offrampProofUrlFailed({ code: 'no_wallet' }))
    return
  }
  yield* put(offrampProofUrlLoading())
  try {
    const proof = yield* call(apiGetProofUrl, auth, action.payload.orderId, action.payload.kind)
    yield* put(offrampProofUrlLoaded({ url: proof.url, expires_at: proof.expires_at }))
  } catch (err) {
    Logger.warn(TAG, 'fetchOfframpProofUrl failed', err)
    yield* put(offrampProofUrlFailed({ code: errorCode(err) }))
  }
}

export function* cancelOfframpOrderSaga(
  action: PayloadAction<{ orderId: string; idempotencyKey?: string }>
) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(offrampError({ code: 'no_wallet' }))
    return
  }
  const idempotencyKey = action.payload.idempotencyKey ?? uuidv4()
  yield* put(offrampCancelling())
  try {
    yield* call(apiCancelOrder, auth, action.payload.orderId, idempotencyKey)
    yield* put(offrampAdvance({ status: 'cancelled' }))
  } catch (err) {
    // Race: user tapped cancel while server was confirming the deposit.
    // Server returns 409 order_not_cancelable; treat it as "deposit already
    // landed, poll will move you forward" rather than a hard error so the UI
    // does not scare a user whose money is actually in flight.
    if (errorCode(err) === 'order_not_cancelable') {
      Logger.info(TAG, 'cancelOfframpOrder race: deposit already landed, resuming poll')
      yield* put(pollOfframpOrder({ orderId: action.payload.orderId }))
      return
    }
    yield* put(offrampError(errorMeta(err)))
    reportTucoprampError(err, 'offramp_cancel_order')
  }
}

export function* cancelOnrampOrderSaga(
  action: PayloadAction<{ orderId: string; idempotencyKey?: string }>
) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(onrampError({ code: 'no_wallet' }))
    return
  }
  const idempotencyKey = action.payload.idempotencyKey ?? uuidv4()
  yield* put(onrampCancelling())
  try {
    yield* call(apiCancelOrder, auth, action.payload.orderId, idempotencyKey)
    yield* put(onrampAdvance({ status: 'cancelled' }))
  } catch (err) {
    // Race: user tapped cancel while server was moving the order into review
    // after a proof upload. Server returns 409 order_not_cancelable; resume
    // the poll so the UI advances naturally.
    if (errorCode(err) === 'order_not_cancelable') {
      Logger.info(TAG, 'cancelOnrampOrder race: order moved out of cancelable state, resuming poll')
      yield* put(pollOnrampOrder({ orderId: action.payload.orderId }))
      return
    }
    yield* put(onrampError(errorMeta(err)))
    reportTucoprampError(err, 'onramp_cancel_order')
  }
}

// ---------- On-ramp ----------

export function* requestOnrampQuoteSaga(action: PayloadAction<OnrampQuoteRequest>) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(onrampError({ code: 'no_wallet' }))
    return
  }
  const previousQuote = yield* select((s: RootState) => s.tucopramp.onramp.lastQuote)
  yield* put(onrampQuoting())
  try {
    const quote = yield* call(apiGetOnrampQuote, auth, action.payload)
    yield* put(onrampQuoteReady(quote))
  } catch (err) {
    yield* put(onrampError(errorMeta(err, previousQuote)))
    reportTucoprampError(err, 'onramp_quote')
  }
}

export function* submitOnrampOrderSaga(
  action: PayloadAction<{ body: OnrampOrderRequest; idempotencyKey?: string }>
) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(onrampError({ code: 'no_wallet' }))
    return
  }
  // Same guard as offramp: refetch on stale quote before creating the order.
  const bodyWithFreshQuote = yield* call(ensureFreshOnrampQuote, auth, action.payload.body)
  if (bodyWithFreshQuote === null) return

  // Idempotency-Key precedence: caller > persisted key of the same request
  // (cross-restart / timeout retry) > fresh. See submitOfframpOrderSaga.
  const fingerprint = orderRequestFingerprint(bodyWithFreshQuote)
  const persistedKey = yield* select(onrampPendingIdempotencyKeySelector)
  const persistedFingerprint = yield* select(
    (s: RootState) => s.tucopramp.onramp.pendingRequestFingerprint
  )
  const reusableKey =
    persistedKey && (!persistedFingerprint || persistedFingerprint === fingerprint)
      ? persistedKey
      : null
  const idempotencyKey = action.payload.idempotencyKey ?? reusableKey ?? uuidv4()
  const previousQuote = yield* select((s: RootState) => s.tucopramp.onramp.lastQuote)
  yield* put(onrampCreatingOrder({ idempotencyKey, fingerprint }))
  try {
    const order = yield* call(apiCreateOnrampOrder, auth, bodyWithFreshQuote, idempotencyKey)
    yield* put(onrampOrderCreated(order))
  } catch (err) {
    if (errorCode(err) === 'idempotency_key_reuse') {
      yield* put(onrampPendingIdempotencyKeyCleared())
      yield* call(checkActiveOnrampOrderSaga)
      const resumed = yield* select(
        (s: RootState) =>
          s.tucopramp.onramp.activeCheckStatus === 'done' && !!s.tucopramp.onramp.currentOrder
      )
      if (resumed) return
    }
    yield* put(onrampError(errorMeta(err, previousQuote)))
    reportTucoprampError(err, 'onramp_submit_order')
  }
}

function* ensureFreshOnrampQuote(auth: TucopRampAuth, body: OnrampOrderRequest) {
  const lastQuote = yield* select((s) => s.tucopramp.onramp.lastQuote)
  if (!lastQuote || !lastQuote.expires_at || lastQuote.quote_id !== body.quote_id) {
    return body
  }
  const expiresAtMs = new Date(lastQuote.expires_at).getTime()
  if (!isFinite(expiresAtMs) || Date.now() <= expiresAtMs) {
    return body
  }
  Logger.info(TAG, 'onramp quote expired, refetching before submit')
  yield* put(onrampQuoting())
  try {
    const quoteRequest: OnrampQuoteRequest = {
      gross_amount_cop: body.gross_amount_cop,
      cedula: body.cedula,
      // Same reason as offramp: keep the (type, number) identity aligned
      // between the quote and the order so pricing / KYC gating do not
      // fall back to CC when the user is on CE / TI / PAS.
      document_type: body.document_type,
    }
    const fresh = yield* call(apiGetOnrampQuote, auth, quoteRequest)
    yield* put(onrampQuoteReady(fresh))
    return { ...body, quote_id: fresh.quote_id }
  } catch (err) {
    yield* put(onrampError(errorMeta(err)))
    reportTucoprampError(err, 'onramp_refetch_quote')
    return null
  }
}

export function* uploadOnrampProofSaga(
  action: PayloadAction<{ orderId: string; file: ProofFile }>
) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(onrampProofUploadFailed({ code: 'no_wallet' }))
    return
  }
  yield* put(onrampUploadingProof())
  try {
    yield* call(apiUploadProof, auth, action.payload.orderId, action.payload.file)
    yield* put(onrampProofUploaded())
  } catch (err) {
    // The user already paid: keep the order on the upload step with an
    // inline error and let them retry the upload only.
    yield* put(onrampProofUploadFailed({ code: errorCode(err) }))
    reportTucoprampError(err, 'onramp_upload_proof')
  }
}

// AWAITING_REVIEW and VERIFYING are the two states from which the server may
// route back to AWAITING_PROOF via a retryable operator rejection. Tracked
// locally in the polling loop so we can distinguish "user just uploaded and
// server is in review" from "operator rejected our upload and we are back to
// upload step". The latter drives the UI banner via onrampProofRejectedForRetry.
const RETRYABLE_ROLLBACK_ORIGINS = new Set<OnrampOrderStatus>(['AWAITING_REVIEW', 'VERIFYING'])

function* isOnrampOrderTracked(orderId: string) {
  const current = yield* select((s: RootState) => s.tucopramp.onramp.currentOrder)
  return current?.order_id === orderId
}

export function* pollOnrampOrderSaga(action: PayloadAction<{ orderId: string }>) {
  const { orderId } = action.payload
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(onrampError({ code: 'no_wallet' }))
    return
  }
  let elapsedMs = 0
  let operatorActive = false
  // When the poll (re)starts after the proof was uploaded, treat the order as
  // in review so a server AWAITING_PROOF is recognised as a rejection.
  const proofAlreadyUploaded = yield* select((s: RootState) => s.tucopramp.onramp.proofUploaded)
  let previousStatus: OnrampOrderStatus | null = proofAlreadyUploaded ? 'AWAITING_REVIEW' : null
  while (elapsedMs < POLL_GIVE_UP_AFTER_MS) {
    try {
      const detail = yield* call(apiGetOrder, auth, orderId)
      if (!(yield* call(isOnrampOrderTracked, orderId))) {
        Logger.info(TAG, `pollOnrampOrder: order ${orderId} no longer tracked, stopping`)
        return
      }
      const status = detail.status as OnrampOrderStatus
      const terminal = isOnrampTerminal(status)
      const { status: localStatus, proofUploaded } = yield* select(
        (s: RootState) => s.tucopramp.onramp
      )
      // Regressive transition from a review-side state back to AWAITING_PROOF
      // only happens when an operator rejected the proof with retryable=true.
      // Dispatch a dedicated action so the slice flips the rejection banner
      // flag together with the status update. Any other transition (including
      // the first entry into AWAITING_PROOF from creation) goes through the
      // generic onrampAdvance path so it does not falsely flag as rejection.
      const isRetryableRollback =
        status === 'AWAITING_PROOF' &&
        previousStatus !== null &&
        RETRYABLE_ROLLBACK_ORIGINS.has(previousStatus)
      // An AWAITING_PROOF answer while the upload is in flight, or one that
      // was requested before the upload landed, is stale: keep the local
      // uploading / in-review state until the server catches up.
      const isStaleAwaitingProof =
        status === 'AWAITING_PROOF' &&
        !isRetryableRollback &&
        (localStatus === 'uploading-proof' || (localStatus === 'awaiting-review' && proofUploaded))
      if (isRetryableRollback) {
        yield* put(onrampProofRejectedForRetry())
      } else if (!isStaleAwaitingProof) {
        const mapped = mapOnrampDetailStatus(status)
        if (mapped && (terminal || !isOnrampLocallySettled(localStatus))) {
          yield* put(onrampAdvance({ status: mapped }))
        }
      }
      previousStatus = status
      if (terminal) return
      operatorActive = status === 'VERIFYING'
    } catch (err) {
      Logger.warn(TAG, 'pollOnrampOrder failed, will retry', err)
    }
    const delayMs = pollDelayMs(elapsedMs, operatorActive)
    yield* delay(delayMs)
    elapsedMs += delayMs
  }
  Logger.warn(TAG, `pollOnrampOrder gave up after ${POLL_GIVE_UP_AFTER_MS} ms`)
  if (yield* call(isOnrampOrderTracked, orderId)) {
    yield* put(onrampPollTimedOut())
  }
}

function* pollOnrampOrderUntilStopped(action: PayloadAction<{ orderId: string }>) {
  yield* race({
    poll: call(pollOnrampOrderSaga, action),
    stop: take(stopOnrampPolling.type),
  })
}

// On on-ramp screen mount: resume an open order instead of offering a fresh
// form. For AWAITING_PROOF the user needs the receiving Bre-B key and the
// exact amount again, so the order is rebuilt from the local copy when it is
// the same order, else from the server detail + the public receiving account.
export function* checkActiveOnrampOrderSaga() {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(onrampActiveCheckFailed())
    return
  }
  yield* put(onrampActiveCheckStarted())
  try {
    const params: ListOrdersParams = { type: 'onramp', limit: 10 }
    const page = yield* call(apiListOrders, auth, params)
    const activeSummary = (page.orders ?? []).find(
      (o) =>
        o.status === 'AWAITING_PROOF' || o.status === 'AWAITING_REVIEW' || o.status === 'VERIFYING'
    )
    if (!activeSummary) {
      yield* put(onrampNoActiveFound())
      return
    }
    const detail = yield* call(apiGetOrder, auth, activeSummary.id)
    const status =
      mapOnrampDetailStatus(detail.status as OnrampOrderStatus) ??
      mapOnrampDetailStatus(activeSummary.status as OnrampOrderStatus) ??
      'awaiting-review'
    const localCurrent = yield* select((s: RootState) => s.tucopramp.onramp.currentOrder)
    let currentOrder: OnrampOrderResponse
    if (localCurrent && localCurrent.order_id === detail.id) {
      currentOrder = localCurrent
    } else {
      let account = yield* select(receivingAccountSelector)
      if (!account) {
        try {
          account = yield* call(apiGetReceivingAccount)
          yield* put(setReceivingAccount(account))
        } catch (err) {
          Logger.warn(TAG, 'checkActiveOnrampOrder: receiving account fetch failed', err)
        }
      }
      currentOrder = {
        order_id: detail.id,
        status: detail.status,
        receiving_account: account ?? { kind: 'bre_b_key', bre_b_key: '', display_name: '' },
        gross_amount_cop: detail.gross_amount_cop,
        expires_at: detail.expires_at,
        proof_upload_required: true,
        instructions: '',
      }
    }
    yield* put(onrampActiveResumed({ currentOrder, status }))
  } catch (err) {
    Logger.warn(TAG, 'checkActiveOnrampOrder failed', err)
    yield* put(onrampActiveCheckFailed())
  }
}

// ---------- Helpers ----------

function errorCode(err: unknown): string {
  if (err instanceof TucopRampError) return err.code
  if (err instanceof Error) return err.message.slice(0, 80)
  return 'unknown'
}

// Wire every catch in the TuCOPRamp saga into the shared business-error
// fingerprint. Expected 4xx-style codes (rate_limited_*, cedula_invalid_format,
// idempotency_key_required, wallet_not_linked, wallet_linked_to_other_user)
// are surfaced to the user via offrampError/onrampError but NOT to Sentry:
// they are legitimate server-driven UX branches, not bugs. Everything else
// (transport failures, 5xx, unknown TucopRampError codes, non-Error throws)
// lands with feature:'tucopramp', provider:'internal', action:<caller>, so
// the Sentry dashboard groups all TuCOPRamp incidents under one filterable
// slice regardless of which flow step tripped.
// Every 429 bucket (rate_limited_ip / _consumer / _wallet / _api_key) is
// matched by prefix in isExpectedErrorCode.
const TUCOPRAMP_EXPECTED_ERROR_CODES = new Set<string>([
  'wallet_not_linked',
  'wallet_linked_to_other_user',
  'cedula_invalid_format',
  'cedula_locked_by_active_order',
  'idempotency_key_required',
  'no_wallet',
  'user_not_found',
  'amount_limit_exceeded',
  'proof_signature_invalid',
  'proof_not_found',
  'invalid_upload',
  'quote_expired',
  'order_not_cancelable',
  'order_not_found',
  'idempotency_key_reuse',
  'proof_invalid_type',
  'proof_too_large',
  'proof_not_acceptable_in_state',
])
function isExpectedErrorCode(code: string): boolean {
  return code.startsWith('rate_limited') || TUCOPRAMP_EXPECTED_ERROR_CODES.has(code)
}
function reportTucoprampError(err: unknown, action: string): void {
  const code = errorCode(err)
  if (isExpectedErrorCode(code)) return
  captureBusinessError(err instanceof Error ? err : new Error(String(err)), {
    feature: 'tucopramp',
    provider: 'internal',
    action,
    errorCode: code,
  })
}

// Extract the full error metadata (code + optional retry-after + request_id)
// for propagation into flow error dispatches. Retry-After only lands when the
// server sent it (typically a 429 rate_limited_*); request_id lands whenever the
// RFC 7807 envelope carried it. Non-TucopRampError paths still surface the
// code but leave retry/request_id null.
// For amount_limit_exceeded the remaining daily / monthly amounts come from
// the error body when the server includes them (top level, or under
// `details` / `limits` on the legacy bodies), else from the last quote.
function errorMeta(err: unknown, lastQuote?: QuoteResponse | null): FlowErrorPayload {
  if (err instanceof TucopRampError) {
    const remaining =
      err.code === 'amount_limit_exceeded' ? remainingFromError(err, lastQuote) : null
    return {
      code: err.code,
      retryAfterSeconds: err.retryAfterSeconds ?? null,
      request_id: err.request_id ?? null,
      remainingDailyCop: remaining?.daily ?? null,
      remainingMonthlyCop: remaining?.monthly ?? null,
    }
  }
  return { code: errorCode(err), retryAfterSeconds: null, request_id: null }
}

function remainingFromError(
  err: TucopRampError,
  lastQuote?: QuoteResponse | null
): { daily: number | null; monthly: number | null } {
  const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  const envelope = asRecord(err.envelope)
  const details = asRecord(envelope?.details)
  const sources = [envelope, details, asRecord(envelope?.limits), asRecord(details?.limits)]
  const pick = (key: string): number | null => {
    for (const source of sources) {
      const value = source?.[key]
      if (typeof value === 'number' && Number.isFinite(value)) return value
    }
    return null
  }
  return {
    daily: pick('remaining_daily_cop') ?? lastQuote?.remaining_daily_cop ?? null,
    monthly: pick('remaining_monthly_cop') ?? lastQuote?.remaining_monthly_cop ?? null,
  }
}

function mapOfframpDetailStatus(status: OfframpOrderStatus): OfframpFlowStatus | null {
  switch (status) {
    case 'AWAITING_DEPOSIT':
      return 'awaiting-deposit'
    case 'DEPOSIT_CONFIRMED':
      return 'deposit-confirmed'
    case 'PROCESSING':
      return 'processing'
    case 'COMPLETED':
      return 'completed'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'REFUND_OWED':
      return 'refund-owed'
    case 'REFUNDED':
      return 'refunded'
    default:
      // A status this build does not know: leave the local state alone.
      return null
  }
}

function mapOnrampDetailStatus(status: OnrampOrderStatus): OnrampFlowStatus | null {
  switch (status) {
    case 'AWAITING_PROOF':
      return 'awaiting-proof-upload'
    case 'AWAITING_REVIEW':
      return 'awaiting-review'
    case 'VERIFYING':
      return 'verifying'
    case 'COMPLETED':
      return 'completed'
    case 'REJECTED':
      return 'rejected'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    default:
      return null
  }
}

// ---------- Root ----------

export function* tucoprampSaga() {
  // One-shot limits fetch at saga boot (which fires post-REHYDRATE per
  // rootSaga). The saga itself is TTL-guarded so it becomes a no-op on
  // warm cache. Forked so the takeLatest registrations below don't wait
  // for the network call.
  yield* fork(fetchLimitsSaga)

  yield* takeLatest(fetchLimits.type, fetchLimitsSaga)
  yield* takeLatest(fetchBanks.type, fetchBanksSaga)
  yield* takeLatest(fetchReceivingAccount.type, fetchReceivingAccountSaga)
  yield* takeLatest(fetchUserProfile.type, fetchUserProfileSaga)
  yield* takeLatest(submitCedulaUpdate.type, submitCedulaUpdateSaga)
  yield* takeLatest(requestOfframpQuote.type, requestOfframpQuoteSaga)
  yield* takeLatest(submitOfframpOrder.type, submitOfframpOrderSaga)
  yield* takeLatest(pollOfframpOrder.type, pollOfframpOrderUntilStopped)
  yield* takeLatest(cancelOfframpOrder.type, cancelOfframpOrderSaga)
  yield* takeLatest(fetchOfframpProofUrl.type, fetchOfframpProofUrlSaga)
  // takeLeading: ignore concurrent dispatches so a rapid re-render or a
  // double-tap can't broadcast the same deposit twice. The dispatchedSendOrderIdRef
  // guard in the component is defense in depth; the saga registration is the
  // authoritative single-flight lock.
  yield* takeLeading(sendOfframpDeposit.type, sendOfframpDepositSaga)
  yield* takeLatest(checkActiveOfframpOrder.type, checkActiveOfframpOrderSaga)
  yield* takeLatest(requestOnrampQuote.type, requestOnrampQuoteSaga)
  yield* takeLatest(submitOnrampOrder.type, submitOnrampOrderSaga)
  yield* takeLatest(uploadOnrampProof.type, uploadOnrampProofSaga)
  yield* takeLatest(pollOnrampOrder.type, pollOnrampOrderUntilStopped)
  yield* takeLatest(cancelOnrampOrder.type, cancelOnrampOrderSaga)
  yield* takeLatest(checkActiveOnrampOrder.type, checkActiveOnrampOrderSaga)
}

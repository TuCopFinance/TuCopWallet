import { createAction, PayloadAction } from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'
import { Address } from 'viem'
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
  onrampPendingIdempotencyKeySelector,
} from 'src/tucopramp/selectors'
import {
  cedulaUpdateFailed,
  cedulaUpdateSucceeded,
  cedulaUpdating,
  limitsBackgroundRevalidateFinished,
  limitsBackgroundRevalidateStarted,
  limitsFetched,
  offrampAdvance,
  offrampCancelling,
  offrampCreatingOrder,
  offrampError,
  offrampOrderCreated,
  offrampProofUrlFailed,
  offrampProofUrlLoaded,
  offrampProofUrlLoading,
  offrampQuoteReady,
  offrampQuoting,
  onrampAdvance,
  onrampCreatingOrder,
  onrampError,
  onrampOrderCreated,
  onrampProofUploaded,
  onrampQuoteReady,
  onrampQuoting,
  onrampUploadingProof,
  setBanks,
  setReceivingAccount,
  setUserProfile,
} from 'src/tucopramp/slice'
import {
  OfframpOrderRequest,
  OfframpOrderStatus,
  OfframpQuoteRequest,
  OnrampOrderRequest,
  OnrampOrderStatus,
  OnrampQuoteRequest,
  TucopRampError,
} from 'src/tucopramp/types'
import Logger from 'src/utils/Logger'
import { getKeychainAccounts } from 'src/web3/contracts'
import { KeychainAccounts } from 'src/web3/KeychainAccounts'
import { walletAddressSelector } from 'src/web3/selectors'
import { call, delay, fork, put, select, takeLatest } from 'typed-redux-saga'

const TAG = 'tucopramp/saga'

// Poll cadence per guide sec 10: 15 s during AWAITING_DEPOSIT / AWAITING_PROOF,
// back off to 30 s once the operator has claimed, stop on terminal state.
const POLL_INITIAL_DELAY_MS = 15_000
const POLL_ACTIVE_DELAY_MS = 30_000
const POLL_MAX_ATTEMPTS = 60 // 60 * 15s = 15min ceiling before saga bails

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
export const cancelOfframpOrder = createAction<{ orderId: string; idempotencyKey?: string }>(
  'tucopramp/cancelOfframpOrder'
)
export const fetchOfframpProofUrl = createAction<{ orderId: string; kind: ProofKind }>(
  'tucopramp/fetchOfframpProofUrl'
)

export const requestOnrampQuote = createAction<OnrampQuoteRequest>('tucopramp/requestOnrampQuote')
export const submitOnrampOrder = createAction<{
  body: OnrampOrderRequest
  idempotencyKey?: string
}>('tucopramp/submitOnrampOrder')
export const uploadOnrampProof = createAction<{ orderId: string; file: ProofFile }>(
  'tucopramp/uploadOnrampProof'
)
export const pollOnrampOrder = createAction<{ orderId: string }>('tucopramp/pollOnrampOrder')

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
  return status === 'COMPLETED' || status === 'CANCELLED' || status === 'EXPIRED'
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
          provider: 'ramp',
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
  yield* put(offrampQuoting())
  try {
    const quote = yield* call(apiGetOfframpQuote, auth, action.payload)
    yield* put(offrampQuoteReady(quote))
  } catch (err) {
    yield* put(offrampError(errorMeta(err)))
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

  // Idempotency-Key precedence: caller-provided > previously persisted
  // (mid-createOrder crash / retry) > fresh UUID for a new intent. The
  // persisted key survives cold boot via REHYDRATE, so a crash+relaunch
  // reuses the same header and the server dedups instead of creating a
  // duplicate real-money order. Cleared on order confirmation.
  const persistedKey = yield* select(offrampPendingIdempotencyKeySelector)
  const idempotencyKey = action.payload.idempotencyKey ?? persistedKey ?? uuidv4()
  yield* put(offrampCreatingOrder({ idempotencyKey }))
  try {
    const order = yield* call(apiCreateOfframpOrder, auth, bodyWithFreshQuote, idempotencyKey)
    yield* put(offrampOrderCreated(order))
  } catch (err) {
    yield* put(offrampError(errorMeta(err)))
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
    }
    const fresh = yield* call(apiGetOfframpQuote, auth, quoteRequest)
    yield* put(offrampQuoteReady(fresh))
    return { ...body, quote_id: fresh.quote_id }
  } catch (err) {
    yield* put(offrampError(errorMeta(err)))
    return null
  }
}

export function* pollOfframpOrderSaga(action: PayloadAction<{ orderId: string }>) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(offrampError({ code: 'no_wallet' }))
    return
  }
  let attempts = 0
  let delayMs = POLL_INITIAL_DELAY_MS
  while (attempts < POLL_MAX_ATTEMPTS) {
    try {
      const detail = yield* call(apiGetOrder, auth, action.payload.orderId)
      const status = detail.status as OfframpOrderStatus
      yield* put(offrampAdvance({ status: mapOfframpDetailStatus(status) }))
      if (isOfframpTerminal(status)) return
      if (status === 'DEPOSIT_CONFIRMED' || status === 'PROCESSING') {
        delayMs = POLL_ACTIVE_DELAY_MS
      }
    } catch (err) {
      Logger.warn(TAG, 'pollOfframpOrder failed, will retry', err)
    }
    yield* delay(delayMs)
    attempts++
  }
  Logger.warn(TAG, `pollOfframpOrder gave up after ${POLL_MAX_ATTEMPTS} attempts`)
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
    yield* put(offrampError(errorMeta(err)))
  }
}

// ---------- On-ramp ----------

export function* requestOnrampQuoteSaga(action: PayloadAction<OnrampQuoteRequest>) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(onrampError({ code: 'no_wallet' }))
    return
  }
  yield* put(onrampQuoting())
  try {
    const quote = yield* call(apiGetOnrampQuote, auth, action.payload)
    yield* put(onrampQuoteReady(quote))
  } catch (err) {
    yield* put(onrampError(errorMeta(err)))
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

  // Idempotency-Key precedence: caller > persisted (cross-restart) > fresh.
  // See submitOfframpOrderSaga for the rationale.
  const persistedKey = yield* select(onrampPendingIdempotencyKeySelector)
  const idempotencyKey = action.payload.idempotencyKey ?? persistedKey ?? uuidv4()
  yield* put(onrampCreatingOrder({ idempotencyKey }))
  try {
    const order = yield* call(apiCreateOnrampOrder, auth, bodyWithFreshQuote, idempotencyKey)
    yield* put(onrampOrderCreated(order))
  } catch (err) {
    yield* put(onrampError(errorMeta(err)))
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
    }
    const fresh = yield* call(apiGetOnrampQuote, auth, quoteRequest)
    yield* put(onrampQuoteReady(fresh))
    return { ...body, quote_id: fresh.quote_id }
  } catch (err) {
    yield* put(onrampError(errorMeta(err)))
    return null
  }
}

export function* uploadOnrampProofSaga(
  action: PayloadAction<{ orderId: string; file: ProofFile }>
) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(onrampError({ code: 'no_wallet' }))
    return
  }
  yield* put(onrampUploadingProof())
  try {
    yield* call(apiUploadProof, auth, action.payload.orderId, action.payload.file)
    yield* put(onrampProofUploaded())
  } catch (err) {
    yield* put(onrampError(errorMeta(err)))
  }
}

export function* pollOnrampOrderSaga(action: PayloadAction<{ orderId: string }>) {
  const auth = yield* call(resolveAuth)
  if (!auth) {
    yield* put(onrampError({ code: 'no_wallet' }))
    return
  }
  let attempts = 0
  let delayMs = POLL_INITIAL_DELAY_MS
  while (attempts < POLL_MAX_ATTEMPTS) {
    try {
      const detail = yield* call(apiGetOrder, auth, action.payload.orderId)
      const status = detail.status as OnrampOrderStatus
      yield* put(onrampAdvance({ status: mapOnrampDetailStatus(status) }))
      if (isOnrampTerminal(status)) return
      if (status === 'VERIFYING') delayMs = POLL_ACTIVE_DELAY_MS
    } catch (err) {
      Logger.warn(TAG, 'pollOnrampOrder failed, will retry', err)
    }
    yield* delay(delayMs)
    attempts++
  }
  Logger.warn(TAG, `pollOnrampOrder gave up after ${POLL_MAX_ATTEMPTS} attempts`)
}

// ---------- Helpers ----------

function errorCode(err: unknown): string {
  if (err instanceof TucopRampError) return err.code
  if (err instanceof Error) return err.message.slice(0, 80)
  return 'unknown'
}

// Extract the full error metadata (code + optional retry-after + request_id)
// for propagation into flow error dispatches. Retry-After only lands when the
// server sent it (typically 429 rate_limited); request_id lands whenever the
// RFC 7807 envelope carried it. Non-TucopRampError paths still surface the
// code but leave retry/request_id null.
function errorMeta(err: unknown): {
  code: string
  retryAfterSeconds: number | null
  request_id: string | null
} {
  if (err instanceof TucopRampError) {
    return {
      code: err.code,
      retryAfterSeconds: err.retryAfterSeconds ?? null,
      request_id: err.request_id ?? null,
    }
  }
  return { code: errorCode(err), retryAfterSeconds: null, request_id: null }
}

function mapOfframpDetailStatus(status: OfframpOrderStatus) {
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
  }
}

function mapOnrampDetailStatus(status: OnrampOrderStatus) {
  switch (status) {
    case 'AWAITING_PROOF':
      return 'awaiting-proof-upload'
    case 'AWAITING_REVIEW':
      return 'awaiting-review'
    case 'VERIFYING':
      return 'verifying'
    case 'COMPLETED':
      return 'completed'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
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
  yield* takeLatest(pollOfframpOrder.type, pollOfframpOrderSaga)
  yield* takeLatest(cancelOfframpOrder.type, cancelOfframpOrderSaga)
  yield* takeLatest(fetchOfframpProofUrl.type, fetchOfframpProofUrlSaga)
  yield* takeLatest(requestOnrampQuote.type, requestOnrampQuoteSaga)
  yield* takeLatest(submitOnrampOrder.type, submitOnrampOrderSaga)
  yield* takeLatest(uploadOnrampProof.type, uploadOnrampProofSaga)
  yield* takeLatest(pollOnrampOrder.type, pollOnrampOrderSaga)
}

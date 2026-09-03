import { createAction, PayloadAction } from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'
import { Address } from 'viem'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import {
  cancelOrder as apiCancelOrder,
  createOfframpOrder as apiCreateOfframpOrder,
  createOnrampOrder as apiCreateOnrampOrder,
  getBanks as apiGetBanks,
  getLimits as apiGetLimits,
  getMe as apiGetMe,
  getOfframpQuote as apiGetOfframpQuote,
  getOnrampQuote as apiGetOnrampQuote,
  getOrder as apiGetOrder,
  getReceivingAccount as apiGetReceivingAccount,
  ProofFile,
  TucopRampAuth,
  uploadProof as apiUploadProof,
} from 'src/tucopramp/api'
import { limitsFetchedAtSelector } from 'src/tucopramp/selectors'
import {
  limitsFetched,
  offrampAdvance,
  offrampCancelling,
  offrampCreatingOrder,
  offrampError,
  offrampOrderCreated,
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

// Runtime operational caps from GET /v1/p2p/limits. Guarded by a 12h TTL so
// the fetch fires at most once per boot per fresh cache window. On any
// failure the hardcoded fallback in limits.ts keeps the UI working; we still
// report via captureBusinessError so persistent server-side outages surface
// on the dashboard.
export function* fetchLimitsSaga() {
  const fetchedAt = yield* select(limitsFetchedAtSelector)
  const now = Date.now()
  if (fetchedAt !== null && now - fetchedAt < LIMITS_CACHE_TTL_MS) {
    return // warm cache, skip
  }
  try {
    const limits = yield* call(apiGetLimits)
    yield* put(limitsFetched({ value: limits, fetchedAt: now }))
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
    yield* put(offrampError({ code: errorCode(err) }))
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

  const idempotencyKey = action.payload.idempotencyKey ?? uuidv4()
  yield* put(offrampCreatingOrder({ idempotencyKey }))
  try {
    const order = yield* call(apiCreateOfframpOrder, auth, bodyWithFreshQuote, idempotencyKey)
    yield* put(offrampOrderCreated(order))
  } catch (err) {
    yield* put(offrampError({ code: errorCode(err) }))
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
    yield* put(offrampError({ code: errorCode(err) }))
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
    yield* put(offrampError({ code: errorCode(err) }))
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
    yield* put(onrampError({ code: errorCode(err) }))
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

  const idempotencyKey = action.payload.idempotencyKey ?? uuidv4()
  yield* put(onrampCreatingOrder({ idempotencyKey }))
  try {
    const order = yield* call(apiCreateOnrampOrder, auth, bodyWithFreshQuote, idempotencyKey)
    yield* put(onrampOrderCreated(order))
  } catch (err) {
    yield* put(onrampError({ code: errorCode(err) }))
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
    yield* put(onrampError({ code: errorCode(err) }))
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
    yield* put(onrampError({ code: errorCode(err) }))
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
  yield* takeLatest(requestOfframpQuote.type, requestOfframpQuoteSaga)
  yield* takeLatest(submitOfframpOrder.type, submitOfframpOrderSaga)
  yield* takeLatest(pollOfframpOrder.type, pollOfframpOrderSaga)
  yield* takeLatest(cancelOfframpOrder.type, cancelOfframpOrderSaga)
  yield* takeLatest(requestOnrampQuote.type, requestOnrampQuoteSaga)
  yield* takeLatest(submitOnrampOrder.type, submitOnrampOrderSaga)
  yield* takeLatest(uploadOnrampProof.type, uploadOnrampProofSaga)
  yield* takeLatest(pollOnrampOrder.type, pollOnrampOrderSaga)
}

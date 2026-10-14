import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction } from 'redux-persist'
import { getRehydratePayload } from 'src/redux/persist-helper'
import {
  Bank,
  MeResponse,
  OfframpOrderResponse,
  OnrampOrderResponse,
  OrderDetail,
  QuoteResponse,
  ReceivingAccountResponse,
  TucopRampLimits,
} from 'src/tucopramp/types'

// Flow status enums surface to the UI. Kept separate for off-ramp vs on-ramp
// because the two flows share little in the middle even if the endpoints
// look symmetric.

export type OfframpFlowStatus =
  | 'idle'
  | 'quoting'
  | 'quote-ready'
  | 'creating-order'
  | 'awaiting-deposit'
  | 'deposit-confirmed'
  | 'processing'
  | 'completed'
  | 'cancelling'
  | 'cancelled'
  | 'expired'
  | 'refund-owed'
  | 'refunded'
  // The poller gave up (24h of backoff) while the order was still open. The
  // order is NOT final: the UI offers a manual refresh.
  | 'poll-timeout'
  | 'error'

export type OnrampFlowStatus =
  | 'idle'
  | 'quoting'
  | 'quote-ready'
  | 'creating-order'
  | 'awaiting-proof-upload'
  | 'uploading-proof'
  | 'awaiting-review'
  | 'verifying'
  | 'completed'
  | 'rejected'
  | 'cancelling'
  | 'cancelled'
  | 'expired'
  | 'poll-timeout'
  | 'error'

// Local flow statuses that mean the order reached a final server state. Used
// by the reset reducers (a final order is dropped, an open one is kept so the
// user can come back to it) and by the pollers (never overwrite a final
// state with a stale non-final poll response).
export const OFFRAMP_FINAL_STATUSES: readonly OfframpFlowStatus[] = [
  'completed',
  'cancelled',
  'expired',
  'refunded',
]
export const ONRAMP_FINAL_STATUSES: readonly OnrampFlowStatus[] = [
  'completed',
  'rejected',
  'cancelled',
  'expired',
]

// Short-lived HMAC-signed URL from GET /v1/p2p/orders/{id}/proof-url. Not
// persisted across app restarts (server TTL 300 s, wallet re-fetches on
// terminal-screen re-open). Kept on the offramp flow rather than a global
// slot because only the offramp completion screen renders it today.
interface ProofUrl {
  url: string
  expires_at: string
}

// Extended error metadata carried on both offramp and onramp flow slices.
// retryAfterSeconds is only populated for rate_limited codes (extracted from
// the server's Retry-After response header via TucopRampError.retryAfterSeconds).
// request_id is populated for every RFC 7807 error envelope the server returns
// (client.ts parses it out of the JSON body).
// errorRemainingDailyCop / errorRemainingMonthlyCop carry the user's remaining
// daily / monthly amounts for amount_limit_exceeded, read from the error body
// when the server includes them, else from the last quote.
interface FlowErrorMeta {
  errorCode: string | null
  errorRetryAfterSeconds: number | null
  errorRequestId: string | null
  errorRemainingDailyCop: number | null
  errorRemainingMonthlyCop: number | null
}

export interface FlowErrorPayload {
  code: string
  retryAfterSeconds?: number | null
  request_id?: string | null
  remainingDailyCop?: number | null
  remainingMonthlyCop?: number | null
}

// Local state for the on-chain COPm deposit that the wallet broadcasts as
// part of the offramp flow. The server does NOT expose the deposit tx hash
// back through the wallet-facing GET /v1/p2p/orders/{id} endpoint (that field
// only lives on AdminOrderDetail). So the wallet keeps the hash it got from
// broadcasting locally and renders it as the user's on-chain receipt link.
export type OfframpDepositTxStatus = 'idle' | 'submitting' | 'submitted' | 'failed'

// Cached payout details from the user's most recent COMPLETED offramp order.
// Used to prefill the payout section of a fresh form so the user does not
// have to re-enter the same bank / Bre-B key every time. Populated by the
// resume-check saga when it finds no active order but a recent completed one.
// bank_account_number is intentionally NOT here - the server only returns
// last_4 for privacy, so full account numbers must be re-entered.
export interface LastOfframpPayout {
  method: 'bank_account' | 'bre_b_key'
  bank_code: string | null
  bank_account_type: string | null
  bank_account_number_last_4: string | null
  bre_b_key: string | null
}

// Locally cached offramp payout profile. The server does NOT expose the
// per-order personal info (full_name / cedula / email) on the wallet-facing
// OrderDetail schema, so the wallet builds its own destination-keyed cache
// on every successful order creation. When the user starts a new order and
// types a Bre-B key or a bank_account_number that matches a saved profile,
// the personal info is overwritten with the ones tied to that specific
// destination. This handles the "one wallet, many payout beneficiaries"
// case (self + spouse + parent, each with their own name + cedula).
// Match keys:
//   - bre_b_key exact match, OR
//   - bank_code + bank_account_number (full) exact match.
export interface SavedPayoutProfile {
  method: 'bank_account' | 'bre_b_key'
  bre_b_key: string | null
  bank_code: string | null
  bank_account_type: string | null
  bank_account_number: string | null
  full_name: string
  cedula: string
  email: string
  lastUsedAt: number
}

interface OfframpFlow extends FlowErrorMeta {
  status: OfframpFlowStatus
  lastQuote: QuoteResponse | null
  currentOrder: OfframpOrderResponse | null
  idempotencyKey: string | null
  // Persisted across app restarts. Generated once when the user first hits
  // Confirm; reused on every subsequent submit of the same request until the
  // order is confirmed (server dedups server-side via Idempotency-Key header)
  // or the user changes the request. Survives offrampReset, so a retry after
  // a timeout reuses the key and cannot create a duplicate real-money order.
  pendingIdempotencyKey: string | null
  // Hash of the order request (minus quote_id) the pending key belongs to.
  // A submit whose fingerprint differs is a new request and gets a new key.
  // A hash rather than the body so no personal data is persisted here.
  pendingRequestFingerprint: string | null
  proofUrl: ProofUrl | null
  proofUrlLoading: boolean
  proofUrlErrorCode: string | null
  depositTxHash: string | null
  depositTxStatus: OfframpDepositTxStatus
  depositTxErrorCode: string | null
  // The server-side truth about whether the user has an already-active
  // offramp order. Populated once per screen mount by checkActiveOfframpOrder.
  // Enforces the "one active order at a time" invariant: if activeOrderId is
  // set, the fresh-form path is hidden and the resume view is shown instead.
  // activeOrderMissingMultisig flags the edge case where the server has an
  // AWAITING_DEPOSIT order for us but the local slice was wiped (cold boot,
  // reinstall) so we don't have the multisig_address needed to broadcast the
  // deposit - user must cancel + retry.
  activeCheckStatus: 'idle' | 'checking' | 'done' | 'failed'
  activeOrderId: string | null
  activeOrderMissingMultisig: boolean
  // Full server-side detail of the active order. Populated by
  // checkActiveOfframpOrder when resuming. Consumed by the UI to render the
  // amount / payout / expiry card so the user can decide what to do with it
  // instead of seeing a bare cancel button.
  activeOrderDetail: OrderDetail | null
  lastPayout: LastOfframpPayout | null
  // Destination-keyed cache of past payouts, used to prefill personal info
  // when the user re-types a Bre-B key or bank account from a previous
  // order. Persisted across app restarts (see REHYDRATE). Capped at 10
  // entries to bound AsyncStorage growth; oldest entry is dropped when a
  // new one pushes the list past the cap.
  savedPayoutProfiles: SavedPayoutProfile[]
}

interface OnrampFlow extends FlowErrorMeta {
  status: OnrampFlowStatus
  lastQuote: QuoteResponse | null
  currentOrder: OnrampOrderResponse | null
  idempotencyKey: string | null
  pendingIdempotencyKey: string | null
  pendingRequestFingerprint: string | null
  proofUploaded: boolean
  // Inline error on the receipt upload step (proof_too_large, network, ...).
  // Upload failures never leave the upload step: the user already paid, so
  // the order must stay on screen with a retry of the upload only.
  proofUploadErrorCode: string | null
  // Same contract as OfframpFlow.activeCheckStatus: on mount the screen asks
  // the server for an open on-ramp order and resumes it.
  activeCheckStatus: 'idle' | 'checking' | 'done' | 'failed'
  // True when the server state machine moved the order backwards from
  // AWAITING_REVIEW / VERIFYING to AWAITING_PROOF, which is the signal that an
  // operator rejected the previous proof with retryable=true and expects the
  // user to upload a new one. Set by the polling saga on the regressive
  // transition, cleared when the user starts a new upload. UI reads this to
  // show a "comprobante rechazado, sube uno nuevo" banner so the user knows
  // they returned to the upload step by design, not by a UI glitch.
  proofRejectedForRetry: boolean
}

// Server-provided operational caps (min / max / daily / monthly in COP).
// value=null means never fetched (fresh install). Consumers should fall back
// to TUCOPRAMP_HARDCODED_LIMITS in that case (effectiveLimitsSelector does
// the lookup). fetchedAt is a unix-ms timestamp used by the fetch saga to gate
// refetches; serverMaxAgeMs is the last observed Cache-Control: max-age from
// the /limits response (300 s per current server config, but respected per-
// response so a future server bump propagates without a wallet release).
// backgroundRevalidateInFlight guards against firing overlapping background
// revalidate fetches (stale-while-revalidate pattern).
interface LimitsState {
  value: TucopRampLimits | null
  fetchedAt: number | null
  serverMaxAgeMs: number | null
  backgroundRevalidateInFlight: boolean
}

// Settings-side cedula self-correction flow (PATCH /users/cedula). Never
// persisted across restarts — always begins in 'idle' on cold boot.
export type CedulaUpdateStatus = 'idle' | 'updating' | 'success' | 'error'

interface CedulaUpdateState {
  status: CedulaUpdateStatus
  errorCode: string | null
}

export interface State {
  // Cached reference data (safe to keep across sessions once persisted).
  banks: Bank[] | null
  receivingAccount: ReceivingAccountResponse | null
  userProfile: MeResponse | null
  limits: LimitsState

  offramp: OfframpFlow
  onramp: OnrampFlow
  cedulaUpdate: CedulaUpdateState
}

const initialErrorMeta: FlowErrorMeta = {
  errorCode: null,
  errorRetryAfterSeconds: null,
  errorRequestId: null,
  errorRemainingDailyCop: null,
  errorRemainingMonthlyCop: null,
}

const initialOfframp: OfframpFlow = {
  status: 'idle',
  lastQuote: null,
  currentOrder: null,
  idempotencyKey: null,
  pendingIdempotencyKey: null,
  pendingRequestFingerprint: null,
  ...initialErrorMeta,
  proofUrl: null,
  proofUrlLoading: false,
  proofUrlErrorCode: null,
  depositTxHash: null,
  depositTxStatus: 'idle',
  depositTxErrorCode: null,
  activeCheckStatus: 'idle',
  activeOrderId: null,
  activeOrderMissingMultisig: false,
  activeOrderDetail: null,
  lastPayout: null,
  savedPayoutProfiles: [],
}

const initialOnramp: OnrampFlow = {
  status: 'idle',
  lastQuote: null,
  currentOrder: null,
  idempotencyKey: null,
  pendingIdempotencyKey: null,
  pendingRequestFingerprint: null,
  proofUploaded: false,
  proofUploadErrorCode: null,
  activeCheckStatus: 'idle',
  proofRejectedForRetry: false,
  ...initialErrorMeta,
}

function applyError(flow: FlowErrorMeta, payload: FlowErrorPayload) {
  flow.errorCode = payload.code
  flow.errorRetryAfterSeconds = payload.retryAfterSeconds ?? null
  flow.errorRequestId = payload.request_id ?? null
  flow.errorRemainingDailyCop = payload.remainingDailyCop ?? null
  flow.errorRemainingMonthlyCop = payload.remainingMonthlyCop ?? null
}

function clearError(flow: FlowErrorMeta) {
  Object.assign(flow, initialErrorMeta)
}

const initialLimits: LimitsState = {
  value: null,
  fetchedAt: null,
  serverMaxAgeMs: null,
  backgroundRevalidateInFlight: false,
}

const initialCedulaUpdate: CedulaUpdateState = {
  status: 'idle',
  errorCode: null,
}

const initialState: State = {
  banks: null,
  receivingAccount: null,
  userProfile: null,
  limits: initialLimits,
  offramp: initialOfframp,
  onramp: initialOnramp,
  cedulaUpdate: initialCedulaUpdate,
}

export const slice = createSlice({
  name: 'tucopramp',
  initialState,
  reducers: {
    // Reference data
    setBanks: (state, action: PayloadAction<Bank[]>) => {
      state.banks = action.payload
    },
    setReceivingAccount: (state, action: PayloadAction<ReceivingAccountResponse>) => {
      state.receivingAccount = action.payload
    },
    setUserProfile: (state, action: PayloadAction<MeResponse>) => {
      state.userProfile = action.payload
    },
    limitsFetched: (
      state,
      action: PayloadAction<{
        value: TucopRampLimits
        fetchedAt: number
        serverMaxAgeMs?: number | null
      }>
    ) => {
      state.limits.value = action.payload.value
      state.limits.fetchedAt = action.payload.fetchedAt
      // Preserve last-known serverMaxAgeMs when the caller omits it (e.g. a
      // failed header parse), rather than losing the observed value.
      if (action.payload.serverMaxAgeMs !== undefined) {
        state.limits.serverMaxAgeMs = action.payload.serverMaxAgeMs
      }
      state.limits.backgroundRevalidateInFlight = false
    },
    limitsBackgroundRevalidateStarted: (state) => {
      state.limits.backgroundRevalidateInFlight = true
    },
    limitsBackgroundRevalidateFinished: (state) => {
      state.limits.backgroundRevalidateInFlight = false
    },

    // Off-ramp transitions
    //
    // Runs on screen unmount, Retry and Close. Clears the transient flow
    // state but keeps what must outlive the screen:
    //   - savedPayoutProfiles / lastPayout: prefill caches.
    //   - pendingIdempotencyKey (+ fingerprint): until the order is confirmed
    //     created or the request changes, so a retry cannot duplicate it.
    //   - currentOrder + deposit tx state while the order is still open, so
    //     leaving and coming back resumes it (multisig and tx hash included)
    //     instead of the cancel-only view.
    offrampReset: (state) => {
      const prev = state.offramp
      const keepOrder = !!prev.currentOrder && !OFFRAMP_FINAL_STATUSES.includes(prev.status)
      state.offramp = {
        ...initialOfframp,
        pendingIdempotencyKey: prev.pendingIdempotencyKey,
        pendingRequestFingerprint: prev.pendingRequestFingerprint,
        lastPayout: prev.lastPayout,
        savedPayoutProfiles: prev.savedPayoutProfiles,
        ...(keepOrder
          ? {
              currentOrder: prev.currentOrder,
              depositTxHash: prev.depositTxHash,
              depositTxStatus: prev.depositTxStatus,
              depositTxErrorCode: prev.depositTxErrorCode,
            }
          : {}),
      }
    },
    // Retry from the error view. A failure while creating the order goes
    // back to the confirm step with the same quote, so the resubmit is the
    // identical request under the same Idempotency-Key (the server replays
    // the first answer instead of creating a second order). Anything else
    // goes back to the form, whose values live in the screen.
    offrampRetryAfterError: (state) => {
      const canResubmit = !!state.offramp.lastQuote && !!state.offramp.pendingIdempotencyKey
      state.offramp.status = canResubmit ? 'quote-ready' : 'idle'
      clearError(state.offramp)
    },
    // "Editar" on the confirm step: back to the form with its values.
    offrampEditRequest: (state) => {
      state.offramp.status = 'idle'
      state.offramp.lastQuote = null
      clearError(state.offramp)
    },
    offrampQuoting: (state) => {
      state.offramp.status = 'quoting'
      clearError(state.offramp)
    },
    offrampQuoteReady: (state, action: PayloadAction<QuoteResponse>) => {
      state.offramp.status = 'quote-ready'
      state.offramp.lastQuote = action.payload
    },
    offrampCreatingOrder: (
      state,
      action: PayloadAction<{ idempotencyKey: string; fingerprint?: string | null }>
    ) => {
      state.offramp.status = 'creating-order'
      state.offramp.idempotencyKey = action.payload.idempotencyKey
      // Persist the key so a mid-createOrder crash + cold-boot retry reuses
      // the same Idempotency-Key header (server dedups). Cleared on success.
      state.offramp.pendingIdempotencyKey = action.payload.idempotencyKey
      state.offramp.pendingRequestFingerprint = action.payload.fingerprint ?? null
    },
    offrampOrderCreated: (state, action: PayloadAction<OfframpOrderResponse>) => {
      state.offramp.status = 'awaiting-deposit'
      state.offramp.currentOrder = action.payload
      // Order confirmed on the server; clear the pending key so the next
      // NEW intent gets a fresh UUID rather than colliding on the same key.
      state.offramp.pendingIdempotencyKey = null
      state.offramp.pendingRequestFingerprint = null
      state.offramp.depositTxHash = null
      state.offramp.depositTxStatus = 'idle'
      state.offramp.depositTxErrorCode = null
      state.offramp.activeOrderMissingMultisig = false
    },
    // The server answered idempotency_key_reuse: the pending key belongs to
    // a different body. Drop it so the next submit starts a fresh request.
    offrampPendingIdempotencyKeyCleared: (state) => {
      state.offramp.pendingIdempotencyKey = null
      state.offramp.pendingRequestFingerprint = null
    },
    offrampAdvance: (
      state,
      action: PayloadAction<{
        status: OfframpFlowStatus
        currentOrder?: OfframpOrderResponse
      }>
    ) => {
      state.offramp.status = action.payload.status
      if (action.payload.currentOrder) {
        state.offramp.currentOrder = action.payload.currentOrder
      }
    },
    offrampCancelling: (state) => {
      state.offramp.status = 'cancelling'
    },
    offrampPollTimedOut: (state) => {
      state.offramp.status = 'poll-timeout'
    },
    offrampError: (state, action: PayloadAction<FlowErrorPayload>) => {
      state.offramp.status = 'error'
      applyError(state.offramp, action.payload)
    },
    offrampProofUrlLoading: (state) => {
      state.offramp.proofUrlLoading = true
      state.offramp.proofUrlErrorCode = null
    },
    offrampProofUrlLoaded: (state, action: PayloadAction<ProofUrl>) => {
      state.offramp.proofUrl = action.payload
      state.offramp.proofUrlLoading = false
      state.offramp.proofUrlErrorCode = null
    },
    offrampProofUrlFailed: (state, action: PayloadAction<{ code: string }>) => {
      state.offramp.proofUrlLoading = false
      state.offramp.proofUrlErrorCode = action.payload.code
    },
    // On-chain deposit lifecycle, dispatched by sendOfframpDepositSaga. The
    // hash is the ONLY on-chain reference the user gets - the server-facing
    // GET /v1/p2p/orders/{id} response does not include incoming_tx_hash
    // (that field lives on AdminOrderDetail, not P2POrderDetail), so the
    // wallet is the sole source of truth for the deposit tx link.
    offrampDepositSubmitting: (state) => {
      state.offramp.depositTxStatus = 'submitting'
      state.offramp.depositTxErrorCode = null
    },
    offrampDepositBroadcast: (state, action: PayloadAction<{ txHash: string }>) => {
      state.offramp.depositTxStatus = 'submitted'
      state.offramp.depositTxHash = action.payload.txHash
      state.offramp.depositTxErrorCode = null
    },
    offrampDepositFailed: (state, action: PayloadAction<{ code: string }>) => {
      state.offramp.depositTxStatus = 'failed'
      state.offramp.depositTxErrorCode = action.payload.code
    },
    // "Intentar de nuevo" after a failed deposit (broadcast failure or an
    // on-chain revert, where no funds moved). The screen re-prepares and
    // re-sends from the idle state.
    offrampDepositRetry: (state) => {
      state.offramp.depositTxStatus = 'idle'
      state.offramp.depositTxHash = null
      state.offramp.depositTxErrorCode = null
    },
    // Active-order check lifecycle. Dispatched by checkActiveOfframpOrderSaga
    // on offramp screen mount to enforce the "one active order at a time"
    // invariant server-side. See OfframpFlow.activeCheckStatus for details.
    offrampActiveCheckStarted: (state) => {
      state.offramp.activeCheckStatus = 'checking'
      state.offramp.activeOrderMissingMultisig = false
    },
    offrampActiveResumed: (
      state,
      action: PayloadAction<{
        detail: OrderDetail
        currentOrder: OfframpOrderResponse | null
        status: OfframpFlowStatus
        // Hash of a deposit this wallet already broadcast for the order,
        // from the sent-tx log.
        sentDepositTxHash?: string
      }>
    ) => {
      const sentHash = action.payload.sentDepositTxHash ?? null
      state.offramp.activeCheckStatus = 'done'
      state.offramp.activeOrderId = action.payload.detail.id
      state.offramp.activeOrderDetail = action.payload.detail
      state.offramp.status = action.payload.status
      clearError(state.offramp)
      if (action.payload.currentOrder) {
        state.offramp.currentOrder = action.payload.currentOrder
        state.offramp.activeOrderMissingMultisig = false
        // Broadcast but its outcome never reached the slice (app killed,
        // or the send errored after the broadcast): it is on its way.
        if (
          sentHash &&
          (state.offramp.depositTxStatus === 'idle' || state.offramp.depositTxStatus === 'failed')
        ) {
          state.offramp.depositTxHash = sentHash
          state.offramp.depositTxStatus = 'submitted'
          state.offramp.depositTxErrorCode = null
        }
      } else {
        // The local order (if any) is a different one: drop it together
        // with its deposit tx state. Past AWAITING_DEPOSIT the UI renders
        // from activeOrderDetail. In AWAITING_DEPOSIT the wallet lacks the
        // multisig_address (never created it locally, or the slice was
        // wiped), so the UI shows cancel-only.
        // A deposit this wallet already broadcast for the order (the app was
        // killed before the server saw it) is on its way: the UI shows it
        // instead of offering to cancel.
        state.offramp.currentOrder = null
        state.offramp.depositTxHash = sentHash
        state.offramp.depositTxStatus = sentHash ? 'submitted' : 'idle'
        state.offramp.depositTxErrorCode = null
        state.offramp.activeOrderMissingMultisig = action.payload.status === 'awaiting-deposit'
      }
    },
    offrampNoActiveFound: (
      state,
      action: PayloadAction<{ lastPayout: LastOfframpPayout | null }>
    ) => {
      state.offramp.activeCheckStatus = 'done'
      state.offramp.activeOrderId = null
      state.offramp.activeOrderDetail = null
      state.offramp.activeOrderMissingMultisig = false
      state.offramp.lastPayout = action.payload.lastPayout
      // The server has no open order, so a locally kept one already ended
      // (completed, expired, ...) while the screen was closed.
      state.offramp.currentOrder = null
      // A pending idempotency key can only belong to an order that ended (or
      // was never created). Reusing it could replay that old order instead
      // of creating a new one, and the auto-send would then fund it.
      state.offramp.pendingIdempotencyKey = null
      state.offramp.pendingRequestFingerprint = null
      state.offramp.depositTxHash = null
      state.offramp.depositTxStatus = 'idle'
      state.offramp.depositTxErrorCode = null
    },
    offrampActiveCheckFailed: (state) => {
      // Fail-open: if the check fails (network, 5xx), don't block the user
      // from creating a new order. Server-side idempotency + the deposit
      // guard still catch double-broadcasts. A kept order whose deposit was
      // already sent (or failed) is resumed locally and the poller corrects
      // its status. One still waiting for its first send is not: without the
      // server's word that it is open, the wallet must not auto-send to it.
      state.offramp.activeCheckStatus = 'failed'
      if (
        state.offramp.currentOrder &&
        state.offramp.status === 'idle' &&
        state.offramp.depositTxStatus !== 'idle'
      ) {
        state.offramp.status = 'awaiting-deposit'
      }
    },
    // Upsert a payout profile keyed by destination (bre_b_key OR
    // bank_code + bank_account_number). Called by submitOfframpOrderSaga
    // right after apiCreateOfframpOrder returns 200. Dedupes on match:
    // an incoming profile that shares the destination with an existing
    // one replaces it (personal info can change over time and the newer
    // submission wins), then the entry bubbles to the head of the array.
    // Cap enforcement keeps the list bounded so AsyncStorage doesn't grow
    // unbounded on power users.
    offrampSavePayoutProfile: (state, action: PayloadAction<SavedPayoutProfile>) => {
      const incoming = action.payload
      const isSameDestination = (a: SavedPayoutProfile, b: SavedPayoutProfile) =>
        a.method === b.method &&
        (a.method === 'bre_b_key'
          ? a.bre_b_key === b.bre_b_key
          : a.bank_code === b.bank_code && a.bank_account_number === b.bank_account_number)
      const filtered = state.offramp.savedPayoutProfiles.filter(
        (p) => !isSameDestination(p, incoming)
      )
      const MAX_SAVED_PROFILES = 10
      state.offramp.savedPayoutProfiles = [incoming, ...filtered].slice(0, MAX_SAVED_PROFILES)
    },

    // On-ramp transitions
    //
    // Same contract as offrampReset: keep the pending idempotency key and,
    // while the order is still open, the order itself.
    onrampReset: (state) => {
      const prev = state.onramp
      const keepOrder = !!prev.currentOrder && !ONRAMP_FINAL_STATUSES.includes(prev.status)
      state.onramp = {
        ...initialOnramp,
        pendingIdempotencyKey: prev.pendingIdempotencyKey,
        pendingRequestFingerprint: prev.pendingRequestFingerprint,
        currentOrder: keepOrder ? prev.currentOrder : null,
      }
    },
    onrampRetryAfterError: (state) => {
      const canResubmit = !!state.onramp.lastQuote && !!state.onramp.pendingIdempotencyKey
      state.onramp.status = canResubmit ? 'quote-ready' : 'idle'
      clearError(state.onramp)
    },
    onrampEditRequest: (state) => {
      state.onramp.status = 'idle'
      state.onramp.lastQuote = null
      clearError(state.onramp)
    },
    onrampQuoting: (state) => {
      state.onramp.status = 'quoting'
      clearError(state.onramp)
    },
    onrampQuoteReady: (state, action: PayloadAction<QuoteResponse>) => {
      state.onramp.status = 'quote-ready'
      state.onramp.lastQuote = action.payload
    },
    onrampCreatingOrder: (
      state,
      action: PayloadAction<{ idempotencyKey: string; fingerprint?: string | null }>
    ) => {
      state.onramp.status = 'creating-order'
      state.onramp.idempotencyKey = action.payload.idempotencyKey
      state.onramp.pendingIdempotencyKey = action.payload.idempotencyKey
      state.onramp.pendingRequestFingerprint = action.payload.fingerprint ?? null
    },
    onrampOrderCreated: (state, action: PayloadAction<OnrampOrderResponse>) => {
      state.onramp.status = 'awaiting-proof-upload'
      state.onramp.currentOrder = action.payload
      state.onramp.pendingIdempotencyKey = null
      state.onramp.pendingRequestFingerprint = null
      state.onramp.proofUploaded = false
      state.onramp.proofUploadErrorCode = null
      state.onramp.proofRejectedForRetry = false
    },
    onrampPendingIdempotencyKeyCleared: (state) => {
      state.onramp.pendingIdempotencyKey = null
      state.onramp.pendingRequestFingerprint = null
    },
    onrampUploadingProof: (state) => {
      state.onramp.status = 'uploading-proof'
      state.onramp.proofUploadErrorCode = null
      // Starting a new upload clears the rejection banner from any previous
      // retryable rejection. If the operator rejects THIS upload too, the
      // polling saga will re-set the flag on the next regressive transition.
      state.onramp.proofRejectedForRetry = false
    },
    onrampProofUploaded: (state) => {
      state.onramp.status = 'awaiting-review'
      state.onramp.proofUploaded = true
      state.onramp.proofUploadErrorCode = null
    },
    // Upload (or local file check) failed: stay on the upload step with an
    // inline error. The order is kept, the user only retries the upload.
    onrampProofUploadFailed: (state, action: PayloadAction<{ code: string }>) => {
      state.onramp.status = 'awaiting-proof-upload'
      state.onramp.proofUploadErrorCode = action.payload.code
    },
    onrampAdvance: (state, action: PayloadAction<{ status: OnrampFlowStatus }>) => {
      state.onramp.status = action.payload.status
    },
    onrampCancelling: (state) => {
      state.onramp.status = 'cancelling'
    },
    onrampPollTimedOut: (state) => {
      state.onramp.status = 'poll-timeout'
    },
    onrampActiveCheckStarted: (state) => {
      state.onramp.activeCheckStatus = 'checking'
    },
    onrampActiveResumed: (
      state,
      action: PayloadAction<{ currentOrder: OnrampOrderResponse; status: OnrampFlowStatus }>
    ) => {
      state.onramp.activeCheckStatus = 'done'
      if (state.onramp.currentOrder?.order_id !== action.payload.currentOrder.order_id) {
        state.onramp.proofRejectedForRetry = false
      }
      state.onramp.currentOrder = action.payload.currentOrder
      state.onramp.status = action.payload.status
      state.onramp.proofUploaded =
        action.payload.status === 'awaiting-review' || action.payload.status === 'verifying'
      state.onramp.proofUploadErrorCode = null
      clearError(state.onramp)
    },
    onrampNoActiveFound: (state) => {
      state.onramp.activeCheckStatus = 'done'
      state.onramp.currentOrder = null
    },
    onrampActiveCheckFailed: (state) => {
      // Fail-open, same as the off-ramp check, including the local resume of
      // a kept order (the poller corrects its status).
      state.onramp.activeCheckStatus = 'failed'
      if (state.onramp.currentOrder && state.onramp.status === 'idle') {
        state.onramp.status = 'awaiting-proof-upload'
      }
    },
    // Dispatched by the polling saga when it detects the specific regressive
    // transition AWAITING_REVIEW / VERIFYING -> AWAITING_PROOF, which the
    // server state machine only produces when an operator rejects the previous
    // proof with retryable=true. Combines status update with rejection-flag
    // set so the UI can distinguish this state from the initial upload step.
    onrampProofRejectedForRetry: (state) => {
      state.onramp.status = 'awaiting-proof-upload'
      state.onramp.proofUploaded = false
      state.onramp.proofRejectedForRetry = true
    },
    onrampError: (state, action: PayloadAction<FlowErrorPayload>) => {
      state.onramp.status = 'error'
      applyError(state.onramp, action.payload)
    },

    // Cedula update transitions
    cedulaUpdateReset: (state) => {
      state.cedulaUpdate = { ...initialCedulaUpdate }
    },
    cedulaUpdating: (state) => {
      state.cedulaUpdate.status = 'updating'
      state.cedulaUpdate.errorCode = null
    },
    cedulaUpdateSucceeded: (state) => {
      state.cedulaUpdate.status = 'success'
      state.cedulaUpdate.errorCode = null
    },
    cedulaUpdateFailed: (state, action: PayloadAction<{ code: string }>) => {
      state.cedulaUpdate.status = 'error'
      state.cedulaUpdate.errorCode = action.payload.code
    },
  },
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE, (state, action: RehydrateAction) => {
      const rehydrated = getRehydratePayload(action, 'tucopramp') as Partial<State> | undefined
      // Reference data (banks / receiving account / user profile / limits)
      // rehydrates as-is. In-flight flow state (quotes, orders, statuses)
      // resets to `idle` on cold start; sagas will re-fetch order status if
      // the user reopens a screen mid-flow. EXCEPTION: pendingIdempotencyKey
      // survives across cold boot so a mid-createOrder crash + retry reuses
      // the same Idempotency-Key header (server dedups). Cleared on order
      // confirmation. Prevents duplicate real-money orders. The request
      // fingerprint travels with the key.
      return {
        ...state,
        banks: rehydrated?.banks ?? state.banks,
        receivingAccount: rehydrated?.receivingAccount ?? state.receivingAccount,
        userProfile: rehydrated?.userProfile ?? state.userProfile,
        limits: rehydrated?.limits ?? state.limits,
        offramp: {
          ...state.offramp,
          pendingIdempotencyKey:
            rehydrated?.offramp?.pendingIdempotencyKey ?? state.offramp.pendingIdempotencyKey,
          pendingRequestFingerprint:
            rehydrated?.offramp?.pendingRequestFingerprint ??
            state.offramp.pendingRequestFingerprint,
          savedPayoutProfiles:
            rehydrated?.offramp?.savedPayoutProfiles ?? state.offramp.savedPayoutProfiles,
        },
        onramp: {
          ...state.onramp,
          pendingIdempotencyKey:
            rehydrated?.onramp?.pendingIdempotencyKey ?? state.onramp.pendingIdempotencyKey,
          pendingRequestFingerprint:
            rehydrated?.onramp?.pendingRequestFingerprint ?? state.onramp.pendingRequestFingerprint,
        },
      }
    })
  },
})

export const {
  setBanks,
  setReceivingAccount,
  setUserProfile,
  limitsFetched,
  limitsBackgroundRevalidateStarted,
  limitsBackgroundRevalidateFinished,
  offrampReset,
  offrampRetryAfterError,
  offrampEditRequest,
  offrampQuoting,
  offrampQuoteReady,
  offrampCreatingOrder,
  offrampOrderCreated,
  offrampPendingIdempotencyKeyCleared,
  offrampAdvance,
  offrampCancelling,
  offrampPollTimedOut,
  offrampError,
  offrampProofUrlLoading,
  offrampProofUrlLoaded,
  offrampProofUrlFailed,
  offrampDepositSubmitting,
  offrampDepositBroadcast,
  offrampDepositFailed,
  offrampDepositRetry,
  offrampActiveCheckStarted,
  offrampActiveResumed,
  offrampNoActiveFound,
  offrampActiveCheckFailed,
  offrampSavePayoutProfile,
  onrampReset,
  onrampRetryAfterError,
  onrampEditRequest,
  onrampQuoting,
  onrampQuoteReady,
  onrampCreatingOrder,
  onrampOrderCreated,
  onrampPendingIdempotencyKeyCleared,
  onrampUploadingProof,
  onrampProofUploaded,
  onrampProofUploadFailed,
  onrampAdvance,
  onrampCancelling,
  onrampPollTimedOut,
  onrampActiveCheckStarted,
  onrampActiveResumed,
  onrampNoActiveFound,
  onrampActiveCheckFailed,
  onrampProofRejectedForRetry,
  onrampError,
  cedulaUpdateReset,
  cedulaUpdating,
  cedulaUpdateSucceeded,
  cedulaUpdateFailed,
} = slice.actions

export default slice.reducer

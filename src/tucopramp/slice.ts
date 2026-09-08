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
  | 'cancelling'
  | 'cancelled'
  | 'expired'
  | 'error'

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
interface FlowErrorMeta {
  errorCode: string | null
  errorRetryAfterSeconds: number | null
  errorRequestId: string | null
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
  // Confirm; reused on every subsequent submit until the order is confirmed
  // (server dedups server-side via Idempotency-Key header) or the user
  // explicitly resets the flow. Prevents duplicate real-money orders when
  // the app crashes mid-createOrder and the user retries after cold boot.
  pendingIdempotencyKey: string | null
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
  proofUploaded: boolean
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
// to TUCOPRAMP_HARDCODED_LIMITS in that case (helper in limits.ts does the
// lookup). fetchedAt is a unix-ms timestamp used by the fetch saga to gate
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

const initialOfframp: OfframpFlow = {
  status: 'idle',
  lastQuote: null,
  currentOrder: null,
  idempotencyKey: null,
  pendingIdempotencyKey: null,
  errorCode: null,
  errorRetryAfterSeconds: null,
  errorRequestId: null,
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
  proofUploaded: false,
  proofRejectedForRetry: false,
  errorCode: null,
  errorRetryAfterSeconds: null,
  errorRequestId: null,
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
    offrampReset: (state) => {
      state.offramp = { ...initialOfframp }
    },
    offrampQuoting: (state) => {
      state.offramp.status = 'quoting'
      state.offramp.errorCode = null
    },
    offrampQuoteReady: (state, action: PayloadAction<QuoteResponse>) => {
      state.offramp.status = 'quote-ready'
      state.offramp.lastQuote = action.payload
    },
    offrampCreatingOrder: (state, action: PayloadAction<{ idempotencyKey: string }>) => {
      state.offramp.status = 'creating-order'
      state.offramp.idempotencyKey = action.payload.idempotencyKey
      // Persist the key so a mid-createOrder crash + cold-boot retry reuses
      // the same Idempotency-Key header (server dedups). Cleared on success.
      state.offramp.pendingIdempotencyKey = action.payload.idempotencyKey
    },
    offrampOrderCreated: (state, action: PayloadAction<OfframpOrderResponse>) => {
      state.offramp.status = 'awaiting-deposit'
      state.offramp.currentOrder = action.payload
      // Order confirmed on the server; clear the pending key so the next
      // NEW intent gets a fresh UUID rather than colliding on the same key.
      state.offramp.pendingIdempotencyKey = null
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
    offrampError: (
      state,
      action: PayloadAction<{
        code: string
        retryAfterSeconds?: number | null
        request_id?: string | null
      }>
    ) => {
      state.offramp.status = 'error'
      state.offramp.errorCode = action.payload.code
      state.offramp.errorRetryAfterSeconds = action.payload.retryAfterSeconds ?? null
      state.offramp.errorRequestId = action.payload.request_id ?? null
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
      }>
    ) => {
      state.offramp.activeCheckStatus = 'done'
      state.offramp.activeOrderId = action.payload.detail.id
      state.offramp.activeOrderDetail = action.payload.detail
      state.offramp.status = action.payload.status
      if (action.payload.currentOrder) {
        state.offramp.currentOrder = action.payload.currentOrder
        state.offramp.activeOrderMissingMultisig = false
      } else {
        // Server has an active AWAITING_DEPOSIT order but we lack the
        // multisig_address (never created it locally, or slice was wiped).
        // UI shows cancel-only in this case.
        state.offramp.activeOrderMissingMultisig = true
      }
    },
    offrampNoActiveFound: (
      state,
      action: PayloadAction<{ lastPayout: LastOfframpPayout | null }>
    ) => {
      state.offramp.activeCheckStatus = 'done'
      state.offramp.activeOrderId = null
      state.offramp.activeOrderMissingMultisig = false
      state.offramp.lastPayout = action.payload.lastPayout
    },
    offrampActiveCheckFailed: (state) => {
      // Fail-open: if the check fails (network, 5xx), don't block the user
      // from creating a new order. Server-side idempotency + the deposit
      // guard still catch double-broadcasts.
      state.offramp.activeCheckStatus = 'failed'
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
    onrampReset: (state) => {
      state.onramp = { ...initialOnramp }
    },
    onrampQuoting: (state) => {
      state.onramp.status = 'quoting'
      state.onramp.errorCode = null
    },
    onrampQuoteReady: (state, action: PayloadAction<QuoteResponse>) => {
      state.onramp.status = 'quote-ready'
      state.onramp.lastQuote = action.payload
    },
    onrampCreatingOrder: (state, action: PayloadAction<{ idempotencyKey: string }>) => {
      state.onramp.status = 'creating-order'
      state.onramp.idempotencyKey = action.payload.idempotencyKey
      state.onramp.pendingIdempotencyKey = action.payload.idempotencyKey
    },
    onrampOrderCreated: (state, action: PayloadAction<OnrampOrderResponse>) => {
      state.onramp.status = 'awaiting-proof-upload'
      state.onramp.currentOrder = action.payload
      state.onramp.pendingIdempotencyKey = null
    },
    onrampUploadingProof: (state) => {
      state.onramp.status = 'uploading-proof'
      // Starting a new upload clears the rejection banner from any previous
      // retryable rejection. If the operator rejects THIS upload too, the
      // polling saga will re-set the flag on the next regressive transition.
      state.onramp.proofRejectedForRetry = false
    },
    onrampProofUploaded: (state) => {
      state.onramp.status = 'awaiting-review'
      state.onramp.proofUploaded = true
    },
    onrampAdvance: (state, action: PayloadAction<{ status: OnrampFlowStatus }>) => {
      state.onramp.status = action.payload.status
    },
    onrampCancelling: (state) => {
      state.onramp.status = 'cancelling'
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
    onrampError: (
      state,
      action: PayloadAction<{
        code: string
        retryAfterSeconds?: number | null
        request_id?: string | null
      }>
    ) => {
      state.onramp.status = 'error'
      state.onramp.errorCode = action.payload.code
      state.onramp.errorRetryAfterSeconds = action.payload.retryAfterSeconds ?? null
      state.onramp.errorRequestId = action.payload.request_id ?? null
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
      // confirmation. Prevents duplicate real-money orders.
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
          savedPayoutProfiles:
            rehydrated?.offramp?.savedPayoutProfiles ?? state.offramp.savedPayoutProfiles,
        },
        onramp: {
          ...state.onramp,
          pendingIdempotencyKey:
            rehydrated?.onramp?.pendingIdempotencyKey ?? state.onramp.pendingIdempotencyKey,
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
  offrampQuoting,
  offrampQuoteReady,
  offrampCreatingOrder,
  offrampOrderCreated,
  offrampAdvance,
  offrampCancelling,
  offrampError,
  offrampProofUrlLoading,
  offrampProofUrlLoaded,
  offrampProofUrlFailed,
  offrampDepositSubmitting,
  offrampDepositBroadcast,
  offrampDepositFailed,
  offrampActiveCheckStarted,
  offrampActiveResumed,
  offrampNoActiveFound,
  offrampActiveCheckFailed,
  offrampSavePayoutProfile,
  onrampReset,
  onrampQuoting,
  onrampQuoteReady,
  onrampCreatingOrder,
  onrampOrderCreated,
  onrampUploadingProof,
  onrampProofUploaded,
  onrampAdvance,
  onrampCancelling,
  onrampProofRejectedForRetry,
  onrampError,
  cedulaUpdateReset,
  cedulaUpdating,
  cedulaUpdateSucceeded,
  cedulaUpdateFailed,
} = slice.actions

export default slice.reducer

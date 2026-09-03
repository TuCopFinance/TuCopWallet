import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction } from 'redux-persist'
import { getRehydratePayload } from 'src/redux/persist-helper'
import {
  Bank,
  MeResponse,
  OfframpOrderResponse,
  OnrampOrderResponse,
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

interface OfframpFlow {
  status: OfframpFlowStatus
  lastQuote: QuoteResponse | null
  currentOrder: OfframpOrderResponse | null
  idempotencyKey: string | null
  errorCode: string | null
  proofUrl: ProofUrl | null
  proofUrlLoading: boolean
  proofUrlErrorCode: string | null
}

interface OnrampFlow {
  status: OnrampFlowStatus
  lastQuote: QuoteResponse | null
  currentOrder: OnrampOrderResponse | null
  idempotencyKey: string | null
  proofUploaded: boolean
  errorCode: string | null
}

// Server-provided operational caps (min / max / daily / monthly in COP).
// value=null means never fetched (fresh install). Consumers should fall back
// to TUCOPRAMP_HARDCODED_LIMITS in that case (helper in limits.ts does the
// lookup). fetchedAt is a unix-ms timestamp used by the fetch saga to skip
// refetching within the 12h TTL agreed in guide sec 10.
interface LimitsState {
  value: TucopRampLimits | null
  fetchedAt: number | null
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
  errorCode: null,
  proofUrl: null,
  proofUrlLoading: false,
  proofUrlErrorCode: null,
}

const initialOnramp: OnrampFlow = {
  status: 'idle',
  lastQuote: null,
  currentOrder: null,
  idempotencyKey: null,
  proofUploaded: false,
  errorCode: null,
}

const initialLimits: LimitsState = {
  value: null,
  fetchedAt: null,
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
      action: PayloadAction<{ value: TucopRampLimits; fetchedAt: number }>
    ) => {
      state.limits.value = action.payload.value
      state.limits.fetchedAt = action.payload.fetchedAt
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
    },
    offrampOrderCreated: (state, action: PayloadAction<OfframpOrderResponse>) => {
      state.offramp.status = 'awaiting-deposit'
      state.offramp.currentOrder = action.payload
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
    offrampError: (state, action: PayloadAction<{ code: string }>) => {
      state.offramp.status = 'error'
      state.offramp.errorCode = action.payload.code
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
    },
    onrampOrderCreated: (state, action: PayloadAction<OnrampOrderResponse>) => {
      state.onramp.status = 'awaiting-proof-upload'
      state.onramp.currentOrder = action.payload
    },
    onrampUploadingProof: (state) => {
      state.onramp.status = 'uploading-proof'
    },
    onrampProofUploaded: (state) => {
      state.onramp.status = 'awaiting-review'
      state.onramp.proofUploaded = true
    },
    onrampAdvance: (state, action: PayloadAction<{ status: OnrampFlowStatus }>) => {
      state.onramp.status = action.payload.status
    },
    onrampError: (state, action: PayloadAction<{ code: string }>) => {
      state.onramp.status = 'error'
      state.onramp.errorCode = action.payload.code
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
      // Only rehydrate reference data. In-flight flow state (quotes, orders,
      // idempotency keys) resets to `idle` on cold start; sagas will fetch
      // fresh order status if the user reopens a screen mid-flow.
      return {
        ...state,
        banks: rehydrated?.banks ?? state.banks,
        receivingAccount: rehydrated?.receivingAccount ?? state.receivingAccount,
        userProfile: rehydrated?.userProfile ?? state.userProfile,
        limits: rehydrated?.limits ?? state.limits,
      }
    })
  },
})

export const {
  setBanks,
  setReceivingAccount,
  setUserProfile,
  limitsFetched,
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
  onrampReset,
  onrampQuoting,
  onrampQuoteReady,
  onrampCreatingOrder,
  onrampOrderCreated,
  onrampUploadingProof,
  onrampProofUploaded,
  onrampAdvance,
  onrampError,
  cedulaUpdateReset,
  cedulaUpdating,
  cedulaUpdateSucceeded,
  cedulaUpdateFailed,
} = slice.actions

export default slice.reducer

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction } from 'redux-persist'
import {
  DepositAccount,
  Destination,
  Party,
  WithdrawQuote,
  Withdrawal,
  WithdrawalPayout,
} from 'src/bridgeramp/api'
import { MentoDirection } from 'src/bridgeramp/mentoRouter'
import { getRehydratePayload } from 'src/redux/persist-helper'

// One Mento swap at a time. For the off-ramp the swap IS the ramp step on
// our side (COPm -> USDC delivered to the user's Bridge liquidation address);
// for the on-ramp it converts the USDC Bridge delivered into COPm.
export type BridgeRampSwapStatus = 'idle' | 'submitting' | 'broadcast' | 'confirmed' | 'failed'

export type BridgeRampSwapErrorCode =
  // The swap transaction was mined but reverted (slippage past amountOutMin,
  // oracle expired between quote and inclusion, deadline passed). Nothing
  // left the user's wallet except gas.
  | 'reverted'
  // Signing or broadcasting failed before the swap was mined. Covers RPC
  // errors, user cancelling the PIN prompt, nonce issues.
  | 'broadcast_failed'
  // The quote was older than the TTL when the saga ran; the screen must
  // re-quote.
  | 'stale_quote'
  // swapCalls refused the recipient (not an address, the Router, or the
  // user's own wallet for a withdraw).
  | 'invalid_recipient'
  // The swap was broadcast but its receipt could not be read (RPC error,
  // timeout). It may still land: the sent-tx record is kept, so a retry with
  // the same flowId waits for that same transaction and never signs again.
  | 'receipt_unknown'
  // The Mento COPm oracle has no valid median (market closed). Nothing was
  // signed; a deposit conversion stays pending and runs once it reopens.
  | 'market_closed'

export interface BridgeRampSwapState {
  status: BridgeRampSwapStatus
  flowId: string | null
  direction: MentoDirection | null
  // Base units as decimal strings so the slice stays serialisable.
  amountIn: string | null
  quotedAmountOut: string | null
  // Where the Router delivers the output token: the liquidation address for
  // a withdraw, the user's own wallet for a deposit conversion.
  recipient: string | null
  approveTxHash: string | null
  swapTxHash: string | null
  errorCode: BridgeRampSwapErrorCode | null
}

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

// Party session for TuCOPRamp's platform API. Memory only: the token is shown
// once by the server and lasts an hour, so a cold start simply opens a new one.
export interface BridgeRampSession {
  token: string
  expiresAt: number // unix seconds
  partyId: string | null
}

export interface BridgeRampPartyState {
  status: LoadStatus
  value: Party | null
  // True when TuCOPRamp answered party_required: the wallet has proved the
  // address but no party is linked to this app yet (onboarding needed).
  needsOnboarding: boolean
  errorCode: string | null
  // POST /v1/parties in flight / refused. Success lands in `value`.
  onboarding: {
    status: 'idle' | 'submitting' | 'error'
    errorCode: string | null
    // TuCOPRamp's request id, for support (party_identity_not_proven...).
    errorRequestId: string | null
  }
}

export interface BridgeRampDestinationsState {
  status: LoadStatus
  items: Destination[]
  errorCode: string | null
  // The key being registered right now, until the directory answers.
  registering: { destinationId: string | null; status: 'idle' | 'pending' | 'error' }
}

// Off-ramp through Bridge, end to end. The chain-side swap is tracked in
// `swap`; this is the TuCOPRamp side (quote, operation, payout).
export type BridgeRampWithdrawStatus =
  | 'idle'
  // POST /v1/withdrawals (the reusable address) + POST /v1/quotes in flight.
  | 'creating'
  // Opening the operation failed before anything was signed (no wallet,
  // quote refused, below the floor...). The amount step shows why.
  | 'start_failed'
  // Address known, waiting for the user to confirm the swap on review.
  | 'review'
  // Swap confirmed on-chain; polling the address until Bridge's payout for
  // this swap reaches a final state.
  | 'awaiting_payout'
  | 'completed'
  | 'failed'

export type BridgeRampWithdrawErrorCode =
  | 'no_wallet'
  | 'session_failed'
  | 'quote_failed'
  | 'create_failed'
  | 'payout_failed'
  | 'poll_timeout'
  | string

export interface BridgeRampWithdrawState {
  status: BridgeRampWithdrawStatus
  // COPm the user is sending, base units as a decimal string. Set when the
  // operation is opened; the review step re-quotes Mento for exactly this.
  copmAmountIn: string | null
  // Price from TuCOPRamp (Bridge rate, fee); only used to estimate the COP.
  quote: WithdrawQuote | null
  // The party's reusable withdrawal address for the chosen key.
  withdrawal: Withdrawal | null
  // COP the user should receive for the swap's guaranteed USDC, whole pesos.
  estimatedCop: string | null
  // One per review attempt, so the swap's sendPreparedTransactions flowId is
  // unique per withdrawal even though the address is reused. Stable across
  // retries of the same attempt.
  attemptId: string | null
  // The swap that funded this withdrawal, kept here so progress still shows
  // it after a restart (the swap slice resets on cold start).
  swapTxHash: string | null
  // Payouts already on the address before this swap, so the one this swap
  // causes can be told apart.
  knownPayoutIds: string[]
  // Bridge's payout for this swap, once it shows up.
  payout: WithdrawalPayout | null
  errorCode: BridgeRampWithdrawErrorCode | null
  // Server error code / request id for support, when TuCOPRamp said why.
  errorRequestId: string | null
}

// On-ramp through Bridge. The user pays COP by Bre-B to the virtual account
// in `account`; Bridge sends USDC to the wallet; the app converts it to COPm.
// There is no per-deposit operation on TuCOPRamp's side, so arrival is
// detected from the wallet's own USDC balance against `usdcBaseline`.
export type BridgeRampDepositStatus = 'idle' | 'creating' | 'ready' | 'failed'

export interface BridgeRampDepositState {
  status: BridgeRampDepositStatus
  account: DepositAccount | null
  errorCode: string | null
  errorRequestId: string | null
  // USDC balance, base units, when the instructions were shown. Any increase
  // while a deposit is open is treated as Bridge's payout.
  usdcBaseline: string | null
  // USDC detected and handed to convertBridgeDeposit, until the swap confirms.
  pending: { usdcAmount: string; flowId: string } | null
}

interface State {
  session: BridgeRampSession | null
  party: BridgeRampPartyState
  destinations: BridgeRampDestinationsState
  withdraw: BridgeRampWithdrawState
  deposit: BridgeRampDepositState
  swap: BridgeRampSwapState
}

const initialSwapState: BridgeRampSwapState = {
  status: 'idle',
  flowId: null,
  direction: null,
  amountIn: null,
  quotedAmountOut: null,
  recipient: null,
  approveTxHash: null,
  swapTxHash: null,
  errorCode: null,
}

const initialOnboarding = { status: 'idle' as const, errorCode: null, errorRequestId: null }

const initialPartyState: BridgeRampPartyState = {
  status: 'idle',
  value: null,
  needsOnboarding: false,
  errorCode: null,
  onboarding: initialOnboarding,
}

const initialDestinationsState: BridgeRampDestinationsState = {
  status: 'idle',
  items: [],
  errorCode: null,
  registering: { destinationId: null, status: 'idle' },
}

const initialWithdrawState: BridgeRampWithdrawState = {
  status: 'idle',
  copmAmountIn: null,
  quote: null,
  withdrawal: null,
  estimatedCop: null,
  attemptId: null,
  swapTxHash: null,
  knownPayoutIds: [],
  payout: null,
  errorCode: null,
  errorRequestId: null,
}

const initialDepositState: BridgeRampDepositState = {
  status: 'idle',
  account: null,
  errorCode: null,
  errorRequestId: null,
  usdcBaseline: null,
  pending: null,
}

export const initialState: State = {
  session: null,
  party: initialPartyState,
  destinations: initialDestinationsState,
  withdraw: initialWithdrawState,
  deposit: initialDepositState,
  swap: initialSwapState,
}

// Bridge drain states: payment_processed is the COP delivered; the rest of
// the final ones mean the USDC came back or the payout stopped.
const PAYOUT_FAILED = new Set(['undeliverable', 'returned', 'refunded', 'canceled', 'error'])
export function payoutOutcome(payout: WithdrawalPayout): 'completed' | 'failed' | 'processing' {
  if (payout.status === 'payment_processed') return 'completed'
  if (PAYOUT_FAILED.has(payout.status)) return 'failed'
  return 'processing'
}

const slice = createSlice({
  name: 'bridgeramp',
  initialState,
  reducers: {
    sessionOpened: (state, action: PayloadAction<BridgeRampSession>) => {
      state.session = action.payload
    },
    sessionCleared: (state) => {
      state.session = null
    },
    partyLoading: (state) => {
      state.party.status = 'loading'
      state.party.errorCode = null
    },
    partyLoaded: (state, action: PayloadAction<Party>) => {
      state.party = {
        status: 'loaded',
        value: action.payload,
        needsOnboarding: false,
        errorCode: null,
        onboarding: initialOnboarding,
      }
    },
    partyNeedsOnboarding: (state) => {
      state.party = {
        ...state.party,
        status: 'loaded',
        value: null,
        needsOnboarding: true,
        errorCode: null,
      }
    },
    onboardingSubmitting: (state) => {
      state.party.onboarding = { status: 'submitting', errorCode: null, errorRequestId: null }
    },
    onboardingFailed: (state, action: PayloadAction<{ code: string; requestId?: string }>) => {
      state.party.onboarding = {
        status: 'error',
        errorCode: action.payload.code,
        errorRequestId: action.payload.requestId ?? null,
      }
    },
    partyFailed: (state, action: PayloadAction<{ code: string }>) => {
      state.party.status = 'error'
      state.party.errorCode = action.payload.code
    },
    destinationsLoading: (state) => {
      state.destinations.status = 'loading'
      state.destinations.errorCode = null
    },
    destinationsLoaded: (state, action: PayloadAction<Destination[]>) => {
      state.destinations.status = 'loaded'
      state.destinations.items = action.payload
      state.destinations.errorCode = null
    },
    destinationsFailed: (state, action: PayloadAction<{ code: string }>) => {
      state.destinations.status = 'error'
      state.destinations.errorCode = action.payload.code
    },
    destinationRegistering: (state) => {
      state.destinations.registering = { destinationId: null, status: 'pending' }
    },
    // Upserts the destination (pending, verified or rejected) into the list.
    destinationUpdated: (state, action: PayloadAction<Destination>) => {
      const incoming = action.payload
      const index = state.destinations.items.findIndex((d) => d.id === incoming.id)
      if (index === -1) {
        state.destinations.items.unshift(incoming)
      } else {
        state.destinations.items[index] = incoming
      }
      if (state.destinations.registering.status === 'pending') {
        state.destinations.registering.destinationId = incoming.id
        if (incoming.status !== 'pending') {
          state.destinations.registering.status = 'idle'
        }
      }
    },
    destinationRegisterFailed: (state, action: PayloadAction<{ code: string }>) => {
      state.destinations.registering.status = 'error'
      state.destinations.errorCode = action.payload.code
    },
    withdrawCreating: (state, action: PayloadAction<{ copmAmountIn: string }>) => {
      state.withdraw = {
        ...initialWithdrawState,
        status: 'creating',
        copmAmountIn: action.payload.copmAmountIn,
      }
    },
    withdrawReady: (
      state,
      action: PayloadAction<{
        quote: WithdrawQuote
        withdrawal: Withdrawal
        estimatedCop: string
        knownPayoutIds: string[]
        attemptId: string
      }>
    ) => {
      state.withdraw.status = 'review'
      state.withdraw.attemptId = action.payload.attemptId
      state.withdraw.swapTxHash = null
      state.withdraw.quote = action.payload.quote
      state.withdraw.withdrawal = action.payload.withdrawal
      state.withdraw.estimatedCop = action.payload.estimatedCop
      state.withdraw.knownPayoutIds = action.payload.knownPayoutIds
      state.withdraw.payout = null
    },
    withdrawAwaitingPayout: (state) => {
      state.withdraw.status = 'awaiting_payout'
    },
    withdrawPayoutUpdated: (state, action: PayloadAction<WithdrawalPayout>) => {
      const payout = action.payload
      state.withdraw.payout = payout
      if (payoutOutcome(payout) === 'completed') {
        state.withdraw.status = 'completed'
      } else if (payoutOutcome(payout) === 'failed') {
        state.withdraw.status = 'failed'
        state.withdraw.errorCode = `payout_${payout.status}`
      }
    },
    // Opening the withdrawal failed; nothing was signed. Payout failures go
    // through withdrawPayoutUpdated instead.
    withdrawFailed: (
      state,
      action: PayloadAction<{ code: BridgeRampWithdrawErrorCode; requestId?: string }>
    ) => {
      state.withdraw.status = 'start_failed'
      state.withdraw.errorCode = action.payload.code
      state.withdraw.errorRequestId = action.payload.requestId ?? null
    },
    // Polling gave up but the payout may still land; the status stays as is
    // and the screen offers a manual refresh.
    withdrawPollTimedOut: (state) => {
      state.withdraw.errorCode = 'poll_timeout'
    },
    withdrawReset: (state) => {
      state.withdraw = initialWithdrawState
      state.swap = initialSwapState
    },
    depositCreating: (state) => {
      state.deposit.status = 'creating'
      state.deposit.errorCode = null
      state.deposit.errorRequestId = null
    },
    depositReady: (
      state,
      action: PayloadAction<{ account: DepositAccount; usdcBaseline: string | null }>
    ) => {
      state.deposit.status = 'ready'
      state.deposit.account = action.payload.account
      state.deposit.errorCode = null
      state.deposit.errorRequestId = null
      // The baseline is set once and kept until a deposit settles: a payout
      // that landed while the app was closed must still read as an increase
      // when the user comes back to this screen.
      // Null when the USDC balance is not known yet; checkDepositSaga sets it
      // once it is.
      state.deposit.usdcBaseline = state.deposit.usdcBaseline ?? action.payload.usdcBaseline
    },
    // Initialises the baseline once the balance is known, and lowers it when
    // USDC left the wallet, so a later deposit is never under-counted.
    depositBaselineUpdated: (state, action: PayloadAction<{ usdcBaseline: string }>) => {
      state.deposit.usdcBaseline = action.payload.usdcBaseline
    },
    depositFailed: (state, action: PayloadAction<{ code: string; requestId?: string }>) => {
      state.deposit.status = 'failed'
      state.deposit.errorCode = action.payload.code
      state.deposit.errorRequestId = action.payload.requestId ?? null
    },
    // USDC above the baseline showed up in the wallet: hand it to the swap.
    depositDetected: (state, action: PayloadAction<{ usdcAmount: string; flowId: string }>) => {
      state.deposit.pending = action.payload
    },
    // The swap confirmed (or the user gave up on it): the new USDC balance is
    // the baseline for the next deposit.
    depositSettled: (state, action: PayloadAction<{ usdcBaseline: string }>) => {
      state.deposit.pending = null
      state.deposit.usdcBaseline = action.payload.usdcBaseline
    },
    depositReset: (state) => {
      state.deposit = { ...initialDepositState, account: state.deposit.account }
      state.swap = initialSwapState
    },
    swapSubmitting: (
      state,
      action: PayloadAction<{
        flowId: string
        direction: MentoDirection
        amountIn: string
        quotedAmountOut: string
        recipient: string
      }>
    ) => {
      state.swap = {
        ...initialSwapState,
        ...action.payload,
        status: 'submitting',
      }
    },
    swapBroadcast: (
      state,
      action: PayloadAction<{ approveTxHash: string | null; swapTxHash: string }>
    ) => {
      state.swap.status = 'broadcast'
      state.swap.approveTxHash = action.payload.approveTxHash
      state.swap.swapTxHash = action.payload.swapTxHash
      // The off-ramp swap under review funds the withdrawal: keep its hash
      // with the withdrawal so it survives a restart.
      if (state.swap.direction === 'copmToUsdc' && state.withdraw.status === 'review') {
        state.withdraw.swapTxHash = action.payload.swapTxHash
      }
    },
    swapConfirmed: (state, _action: PayloadAction<{ confirmedAt: number }>) => {
      state.swap.status = 'confirmed'
    },
    // `flowId` tags failures that happen before swapSubmitting (deposit
    // conversion quoting/pricing) with the flow they belong to.
    swapFailed: (
      state,
      action: PayloadAction<{ code: BridgeRampSwapErrorCode; flowId?: string }>
    ) => {
      state.swap.status = 'failed'
      state.swap.errorCode = action.payload.code
      if (action.payload.flowId) {
        state.swap.flowId = action.payload.flowId
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE, (state, action: RehydrateAction) => {
      const rehydrated = getRehydratePayload(action, 'bridgeramp') as Partial<State> | undefined
      // In-flight swap state resets on cold start: sendPreparedTransactions
      // keeps its own per-flowId record of what was broadcast, and the flow
      // screen re-quotes anyway.
      //
      // The withdraw operation survives only while it is funded and the
      // payout is still owed (awaiting_payout), so the screen can keep
      // polling after a restart. Final results (completed/failed) and
      // anything earlier are dropped: reopening the screen days later must
      // start a new withdrawal, not show an old outcome.
      const persistedWithdraw = rehydrated?.withdraw
      // Pre-2026-10-08 state (one withdrawal per operation) has no
      // knownPayoutIds and cannot be followed any more; drop it.
      const keepWithdraw =
        Array.isArray(persistedWithdraw?.knownPayoutIds) &&
        persistedWithdraw?.status === 'awaiting_payout' &&
        !!persistedWithdraw?.withdrawal
      // The deposit account is permanent and the baseline/pending pair is what
      // lets a payout that arrived while the app was closed be converted on
      // the next visit, so all three survive. Transient status does not.
      const persistedDeposit = rehydrated?.deposit
      // An account stored before 2026-10-08 lacks deposit_instructions: drop
      // it so the screen fetches it again, but keep the baseline and pending.
      const persistedAccount = persistedDeposit?.account?.deposit_instructions
        ? persistedDeposit.account
        : null
      const deposit: BridgeRampDepositState = persistedDeposit?.account
        ? {
            ...initialDepositState,
            status: persistedAccount ? 'ready' : initialDepositState.status,
            account: persistedAccount,
            usdcBaseline: persistedDeposit.usdcBaseline ?? null,
            pending: persistedDeposit.pending ?? null,
          }
        : state.deposit
      return {
        ...state,
        withdraw: keepWithdraw ? { ...initialWithdrawState, ...persistedWithdraw } : state.withdraw,
        deposit,
      }
    })
  },
})

export const {
  sessionOpened,
  sessionCleared,
  partyLoading,
  partyLoaded,
  partyNeedsOnboarding,
  partyFailed,
  onboardingSubmitting,
  onboardingFailed,
  destinationsLoading,
  destinationsLoaded,
  destinationsFailed,
  destinationRegistering,
  destinationUpdated,
  destinationRegisterFailed,
  withdrawCreating,
  withdrawReady,
  withdrawAwaitingPayout,
  withdrawPayoutUpdated,
  withdrawFailed,
  withdrawPollTimedOut,
  depositCreating,
  depositReady,
  depositBaselineUpdated,
  depositFailed,
  depositDetected,
  depositSettled,
  depositReset,
  withdrawReset,
  swapSubmitting,
  swapBroadcast,
  swapConfirmed,
  swapFailed,
} = slice.actions

export default slice.reducer

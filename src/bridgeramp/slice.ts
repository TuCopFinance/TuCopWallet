import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction } from 'redux-persist'
import { Destination, Party, WithdrawQuote, Withdrawal } from 'src/bridgeramp/api'
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

export interface BridgeRampCompletedSwap {
  flowId: string
  direction: MentoDirection
  amountIn: string
  quotedAmountOut: string
  recipient: string
  swapTxHash: string
  confirmedAt: number
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
  // POST /v1/quotes + POST /v1/withdrawals in flight.
  | 'creating'
  // Operation exists, deposit address known, waiting for the user to confirm
  // the swap on the review step.
  | 'review'
  // Swap confirmed on-chain; polling TuCOPRamp until the payout is final.
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
  quote: WithdrawQuote | null
  withdrawal: Withdrawal | null
  errorCode: BridgeRampWithdrawErrorCode | null
  // Server error code / request id for support, when TuCOPRamp said why.
  errorRequestId: string | null
}

interface State {
  session: BridgeRampSession | null
  party: BridgeRampPartyState
  destinations: BridgeRampDestinationsState
  withdraw: BridgeRampWithdrawState
  swap: BridgeRampSwapState
  // Most recent confirmed swap, kept across restarts so the flow screen can
  // show "your USDC reached Bridge, COP is on its way" after a cold start.
  lastCompletedSwap: BridgeRampCompletedSwap | null
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

const initialPartyState: BridgeRampPartyState = {
  status: 'idle',
  value: null,
  needsOnboarding: false,
  errorCode: null,
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
  errorCode: null,
  errorRequestId: null,
}

export const initialState: State = {
  session: null,
  party: initialPartyState,
  destinations: initialDestinationsState,
  withdraw: initialWithdrawState,
  swap: initialSwapState,
  lastCompletedSwap: null,
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
      }
    },
    partyNeedsOnboarding: (state) => {
      state.party = { status: 'loaded', value: null, needsOnboarding: true, errorCode: null }
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
      action: PayloadAction<{ quote: WithdrawQuote; withdrawal: Withdrawal }>
    ) => {
      state.withdraw.status = 'review'
      state.withdraw.quote = action.payload.quote
      state.withdraw.withdrawal = action.payload.withdrawal
    },
    withdrawAwaitingPayout: (state) => {
      state.withdraw.status = 'awaiting_payout'
    },
    withdrawalUpdated: (state, action: PayloadAction<Withdrawal>) => {
      state.withdraw.withdrawal = action.payload
      if (action.payload.status === 'completed') {
        state.withdraw.status = 'completed'
      } else if (
        action.payload.status === 'failed' ||
        action.payload.status === 'refunded' ||
        action.payload.status === 'canceled'
      ) {
        state.withdraw.status = 'failed'
        state.withdraw.errorCode = action.payload.error_code ?? 'payout_failed'
      }
    },
    withdrawFailed: (
      state,
      action: PayloadAction<{ code: BridgeRampWithdrawErrorCode; requestId?: string }>
    ) => {
      state.withdraw.status = 'failed'
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
    },
    swapConfirmed: (state, action: PayloadAction<{ confirmedAt: number }>) => {
      const { flowId, direction, amountIn, quotedAmountOut, recipient, swapTxHash } = state.swap
      state.swap.status = 'confirmed'
      if (flowId && direction && amountIn && quotedAmountOut && recipient && swapTxHash) {
        state.lastCompletedSwap = {
          flowId,
          direction,
          amountIn,
          quotedAmountOut,
          recipient,
          swapTxHash,
          confirmedAt: action.payload.confirmedAt,
        }
      }
    },
    swapFailed: (state, action: PayloadAction<{ code: BridgeRampSwapErrorCode }>) => {
      state.swap.status = 'failed'
      state.swap.errorCode = action.payload.code
    },
    swapReset: (state) => {
      state.swap = initialSwapState
    },
  },
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE, (state, action: RehydrateAction) => {
      const rehydrated = getRehydratePayload(action, 'bridgeramp') as Partial<State> | undefined
      // In-flight swap state resets on cold start: sendPreparedTransactions
      // keeps its own per-flowId record of what was broadcast, and the flow
      // screen re-quotes anyway. Only the last completed swap survives.
      //
      // The withdraw operation survives when it was already funded (the swap
      // is on-chain, TuCOPRamp owes a payout) so the screen can keep polling
      // after a restart; anything earlier is dropped and the user starts over.
      const persistedWithdraw = rehydrated?.withdraw
      const keepWithdraw =
        persistedWithdraw?.status === 'awaiting_payout' ||
        persistedWithdraw?.status === 'completed' ||
        persistedWithdraw?.status === 'failed'
      return {
        ...state,
        withdraw: keepWithdraw ? { ...initialWithdrawState, ...persistedWithdraw } : state.withdraw,
        lastCompletedSwap: rehydrated?.lastCompletedSwap ?? state.lastCompletedSwap,
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
  destinationsLoading,
  destinationsLoaded,
  destinationsFailed,
  destinationRegistering,
  destinationUpdated,
  destinationRegisterFailed,
  withdrawCreating,
  withdrawReady,
  withdrawAwaitingPayout,
  withdrawalUpdated,
  withdrawFailed,
  withdrawPollTimedOut,
  withdrawReset,
  swapSubmitting,
  swapBroadcast,
  swapConfirmed,
  swapFailed,
  swapReset,
} = slice.actions

export default slice.reducer

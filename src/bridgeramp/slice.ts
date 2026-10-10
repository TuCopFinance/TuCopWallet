import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction } from 'redux-persist'
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

interface State {
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

export const initialState: State = {
  swap: initialSwapState,
  lastCompletedSwap: null,
}

const slice = createSlice({
  name: 'bridgeramp',
  initialState,
  reducers: {
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
      return {
        ...state,
        lastCompletedSwap: rehydrated?.lastCompletedSwap ?? state.lastCompletedSwap,
      }
    })
  },
})

export const { swapSubmitting, swapBroadcast, swapConfirmed, swapFailed, swapReset } = slice.actions

export default slice.reducer

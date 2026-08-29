import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { SpendStep } from 'src/dollarsSpend/types'
import { SquidDegradationError } from 'src/swap/types'

// Per-leg lifecycle state, tracked alongside plannedSteps so the progress
// sheet + partial-success sheet can render granular status per token AND
// surface the exact error text for debug (with copy-to-clipboard) when a
// leg fails. Added 2026-08-28 alongside the retry loop so the user can
// see "USDm succeeded on attempt 2 after retry" vs "USDT failed, tap to
// see why".
export interface LegStatus {
  // 'pending' - not started yet
  // 'executing' - fetch or submit in flight for this attempt
  // 'succeeded' - final leg tx mined
  // 'failed' - all retry attempts exhausted
  status: 'pending' | 'executing' | 'succeeded' | 'failed'
  // Current attempt (1-indexed), incremented on each retry.
  attempt: number
  // Tx hash of the mined swap (only set when status === 'succeeded').
  txHash: string | null
  // Human-readable error message from the last failed attempt. Includes the
  // full viem stack trace / RPC error body so the user can copy it and
  // share it with support for debug.
  errorMessage: string | null
  // Optional Squid degradation envelope. Same shape as the top-level
  // lastErrorEnvelope but scoped to this leg.
  errorEnvelope: SquidDegradationError | null
}

interface InFlight {
  plannedSteps: SpendStep[]
  completedSteps: number
  failedAtIndex: number | null
  lastError: string | null
  // Per-leg detailed status. Length matches plannedSteps; index N is leg N.
  // Initialized to all 'pending' when multiSwapStarted fires. Updated by
  // multiSwapLegExecuting / multiSwapLegSucceeded / multiSwapLegFailed as
  // the saga progresses. UI reads this to render the leg list (with status
  // icons + expandable error details per failed leg).
  legStatuses: LegStatus[]
  // Enriched degradation envelope from the failing /api/swap/quote leg, when
  // the error came from Squid upstream (backend PR #228, 2026-08-22). Drives
  // the PartialSuccessSheet copy: `squid_unavailable` + `fallback_hint: USDT`
  // prompts the user to switch to USDT, `squid_rate_limited` surfaces the
  // "servicio saturado" copy with an optional retry countdown. Null when the
  // failure was not a Squid degradation (auth error, wallet unavailable,
  // legacy 5xx without envelope). Type re-exported from swap/types so the
  // sheet and saga share the discriminator.
  lastErrorEnvelope: SquidDegradationError | null
  // When the 7702 atomic path runs, the entire plan resolves in a single tx.
  // The progress sheet hides the "Paso X de N" counter and shows a single
  // "Procesando tu cambio" copy because the per-step granularity is meaningless.
  isAtomic: boolean
  // User-facing label of the destination token (e.g. "Pesos" for COPm swaps,
  // "Oro" for XAUt0 gold buys). Rendered by MultiSwapProgressSheet in the
  // atomic-progress copy ("Cambiando tus Dolares a {{destination}}...") so
  // the same multi-swap infrastructure serves both Dolares -> Pesos and
  // Dolares -> Oro flows without lying about the direction.
  destinationLabel: string
}

export interface State {
  inFlight: InFlight | null
  // True for a brief window after multiSwapStepFailed dispatches and before
  // the UI commits to PartialSuccessSheet. Bridges the render gap where both
  // sheets would otherwise return null. See TransactionFlowShell.
  transitioning: boolean
}

const initialState: State = {
  inFlight: null,
  transitioning: false,
}

const slice = createSlice({
  name: 'dollarsSpend',
  initialState,
  reducers: {
    multiSwapStarted(
      state,
      action: PayloadAction<{ steps: SpendStep[]; isAtomic?: boolean; destinationLabel?: string }>
    ) {
      state.inFlight = {
        plannedSteps: action.payload.steps,
        completedSteps: 0,
        failedAtIndex: null,
        lastError: null,
        lastErrorEnvelope: null,
        legStatuses: action.payload.steps.map(() => ({
          status: 'pending' as const,
          attempt: 0,
          txHash: null,
          errorMessage: null,
          errorEnvelope: null,
        })),
        isAtomic: action.payload.isAtomic ?? false,
        // Default to 'Pesos' preserves legacy Dolares -> Pesos behaviour when
        // a caller predates this field. Gold flows now pass 'Oro' explicitly.
        destinationLabel: action.payload.destinationLabel ?? 'Pesos',
      }
      state.transitioning = false
    },
    multiSwapStepSucceeded(state, action: PayloadAction<{ index: number }>) {
      if (!state.inFlight) return
      state.inFlight.completedSteps = action.payload.index + 1
    },
    multiSwapStepFailed(
      state,
      action: PayloadAction<{
        index: number
        errorMessage: string
        // Optional Squid degradation envelope for enriched failure copy.
        // Sagas call extractSquidEnvelope(err) on the caught error before
        // dispatching; missing (undefined) means the failure was NOT from
        // a Squid quote degradation and the sheet should fall through to
        // the generic body.
        errorEnvelope?: SquidDegradationError | null
      }>
    ) {
      if (!state.inFlight) return
      state.inFlight.failedAtIndex = action.payload.index
      state.inFlight.lastError = action.payload.errorMessage
      state.inFlight.lastErrorEnvelope = action.payload.errorEnvelope ?? null
      state.transitioning = true
    },
    // Per-leg lifecycle actions. Dispatched by the saga alongside the
    // legacy multiSwapStepSucceeded / multiSwapStepFailed so the UI can
    // render per-leg status + attempt count + tx hash + error text.
    // Legacy actions kept for backward compat with the aggregate counters
    // (completedSteps, failedAtIndex) that PartialSuccessSheet's atomic
    // branch still reads.
    multiSwapLegExecuting(state, action: PayloadAction<{ index: number; attempt: number }>) {
      if (!state.inFlight) return
      const leg = state.inFlight.legStatuses[action.payload.index]
      if (!leg) return
      leg.status = 'executing'
      leg.attempt = action.payload.attempt
    },
    multiSwapLegSucceeded(
      state,
      action: PayloadAction<{ index: number; txHash: string; attempt: number }>
    ) {
      if (!state.inFlight) return
      const leg = state.inFlight.legStatuses[action.payload.index]
      if (!leg) return
      leg.status = 'succeeded'
      leg.attempt = action.payload.attempt
      leg.txHash = action.payload.txHash
      leg.errorMessage = null
      leg.errorEnvelope = null
    },
    multiSwapLegFailed(
      state,
      action: PayloadAction<{
        index: number
        attempt: number
        errorMessage: string
        errorEnvelope?: SquidDegradationError | null
      }>
    ) {
      if (!state.inFlight) return
      const leg = state.inFlight.legStatuses[action.payload.index]
      if (!leg) return
      leg.status = 'failed'
      leg.attempt = action.payload.attempt
      leg.errorMessage = action.payload.errorMessage
      leg.errorEnvelope = action.payload.errorEnvelope ?? null
    },
    multiSwapTransitionComplete(state) {
      state.transitioning = false
    },
    multiSwapCompleted(state) {
      state.inFlight = null
      state.transitioning = false
    },
    multiSwapCleared(state) {
      state.inFlight = null
      state.transitioning = false
    },
  },
})

export const {
  multiSwapStarted,
  multiSwapStepSucceeded,
  multiSwapStepFailed,
  multiSwapLegExecuting,
  multiSwapLegSucceeded,
  multiSwapLegFailed,
  multiSwapTransitionComplete,
  multiSwapCompleted,
  multiSwapCleared,
} = slice.actions

export default slice.reducer

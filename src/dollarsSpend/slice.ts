import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { SpendStep } from 'src/dollarsSpend/types'

interface InFlight {
  plannedSteps: SpendStep[]
  completedSteps: number
  failedAtIndex: number | null
  lastError: string | null
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
    multiSwapStepFailed(state, action: PayloadAction<{ index: number; errorMessage: string }>) {
      if (!state.inFlight) return
      state.inFlight.failedAtIndex = action.payload.index
      state.inFlight.lastError = action.payload.errorMessage
      state.transitioning = true
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
  multiSwapTransitionComplete,
  multiSwapCompleted,
  multiSwapCleared,
} = slice.actions

export default slice.reducer

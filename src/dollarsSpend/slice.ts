import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { SpendStep } from 'src/dollarsSpend/types'

interface InFlight {
  plannedSteps: SpendStep[]
  completedSteps: number
  failedAtIndex: number | null
  lastError: string | null
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
    multiSwapStarted(state, action: PayloadAction<{ steps: SpendStep[] }>) {
      state.inFlight = {
        plannedSteps: action.payload.steps,
        completedSteps: 0,
        failedAtIndex: null,
        lastError: null,
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

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
}

const initialState: State = {
  inFlight: null,
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
    },
    multiSwapStepSucceeded(state, action: PayloadAction<{ index: number }>) {
      if (!state.inFlight) return
      state.inFlight.completedSteps = action.payload.index + 1
    },
    multiSwapStepFailed(state, action: PayloadAction<{ index: number; errorMessage: string }>) {
      if (!state.inFlight) return
      state.inFlight.failedAtIndex = action.payload.index
      state.inFlight.lastError = action.payload.errorMessage
    },
    multiSwapCompleted(state) {
      state.inFlight = null
    },
    multiSwapCleared(state) {
      state.inFlight = null
    },
  },
})

export const {
  multiSwapStarted,
  multiSwapStepSucceeded,
  multiSwapStepFailed,
  multiSwapCompleted,
  multiSwapCleared,
} = slice.actions

export default slice.reducer

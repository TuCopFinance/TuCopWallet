import { RootState } from 'src/redux/store'

export const inFlightSelector = (state: RootState) => state.dollarsSpend.inFlight

export const hasInFlightSelector = (state: RootState) => state.dollarsSpend.inFlight !== null

export const inFlightProgressSelector = (state: RootState) => {
  const inFlight = state.dollarsSpend.inFlight
  if (!inFlight) return null
  return {
    completed: inFlight.completedSteps,
    total: inFlight.plannedSteps.length,
    failedAtIndex: inFlight.failedAtIndex,
  }
}

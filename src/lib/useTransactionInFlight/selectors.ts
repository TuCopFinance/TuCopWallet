import type { RootState } from 'src/redux/reducers'
import type { FlowKind, InFlightDescriptor } from './types'

export const allInFlightSelector = (state: RootState): Record<string, InFlightDescriptor> =>
  state.transactionInFlight.byFlow

export const inFlightByIdSelector = (
  state: RootState,
  flowId: string
): InFlightDescriptor | undefined => state.transactionInFlight.byFlow[flowId]

export const currentInFlightForKindSelector = (
  state: RootState,
  kind: FlowKind
): InFlightDescriptor | null => {
  const all = Object.values(state.transactionInFlight.byFlow)
  return (
    all.find(
      (flow) => flow.flowKind === kind && flow.status !== 'succeeded' && flow.status !== 'failed'
    ) ?? null
  )
}

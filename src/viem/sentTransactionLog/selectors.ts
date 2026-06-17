import type { RootState } from 'src/redux/reducers'

export const sentLogByFlowSelector = (state: RootState, flowId: string) =>
  state.sentTransactionLog.byFlow[flowId] ?? []

export const findRecordByIndexSelector = (state: RootState, flowId: string, index: number) =>
  sentLogByFlowSelector(state, flowId).find((r) => r.index === index)

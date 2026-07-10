import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { ErrorClass } from 'src/lib/errors'
import type { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'
import type { InFlightDescriptor, InFlightStatus } from './types'

export interface State {
  byFlow: Record<string, InFlightDescriptor>
}

const initialState: State = { byFlow: {} }

// viem's TransactionRequest carries readonly fields (e.g. `accessList`) that
// Immer's WritableDraft refuses to accept. We cast to `any` for assignments
// into `state.byFlow[...]` since the persisted descriptor is treated as opaque
// here — the structure is exercised through actions, not direct mutation.

const slice = createSlice({
  name: 'transactionInFlight',
  initialState,
  reducers: {
    inFlightStart(state, action: PayloadAction<InFlightDescriptor>) {
      state.byFlow[action.payload.flowId] = action.payload as any
    },
    inFlightAdvance(
      state,
      action: PayloadAction<{
        flowId: string
        toStatus: InFlightStatus
        patch?: Partial<InFlightDescriptor>
      }>
    ) {
      const flow = state.byFlow[action.payload.flowId]
      if (!flow) return
      if (action.payload.patch) {
        Object.assign(flow, action.payload.patch)
      }
      flow.status = action.payload.toStatus
    },
    inFlightFail(state, action: PayloadAction<{ flowId: string; errorClass: ErrorClass }>) {
      const flow = state.byFlow[action.payload.flowId]
      if (!flow) return
      flow.status = 'failed'
      flow.lastErrorClass = action.payload.errorClass
    },
    inFlightRetry(
      state,
      action: PayloadAction<{
        flowId: string
        freshPreparedTransactions?: SerializableTransactionRequest[]
        pollContextPatch?: Record<string, unknown>
      }>
    ) {
      const flow = state.byFlow[action.payload.flowId]
      if (!flow) return
      flow.retryCount += 1
      flow.status = 'preparing'
      flow.lastErrorClass = undefined
      if (action.payload.freshPreparedTransactions) {
        flow.preparedTransactions = action.payload.freshPreparedTransactions as any
      }
      if (action.payload.pollContextPatch) {
        flow.pollContext = { ...(flow.pollContext ?? {}), ...action.payload.pollContextPatch }
      }
    },
    inFlightAbort(state, action: PayloadAction<{ flowId: string }>) {
      delete state.byFlow[action.payload.flowId]
    },
  },
})

export const { inFlightStart, inFlightAdvance, inFlightFail, inFlightRetry, inFlightAbort } =
  slice.actions

export default slice.reducer

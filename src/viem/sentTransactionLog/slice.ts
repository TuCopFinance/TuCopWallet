import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface SentTxRecord {
  flowId: string
  index: number
  nonce: number
  hash: string
  status: 'pending' | 'confirmed' | 'failed'
}

export interface State {
  byFlow: Record<string, SentTxRecord[]>
}

const initialState: State = { byFlow: {} }

const slice = createSlice({
  name: 'sentTransactionLog',
  initialState,
  reducers: {
    recordSent(state, action: PayloadAction<Omit<SentTxRecord, 'status'>>) {
      const r = action.payload
      state.byFlow[r.flowId] ??= []
      state.byFlow[r.flowId].push({ ...r, status: 'pending' })
    },
    markConfirmed(state, action: PayloadAction<{ flowId: string; hash: string }>) {
      const list = state.byFlow[action.payload.flowId]
      const rec = list?.find((r) => r.hash === action.payload.hash)
      if (rec) rec.status = 'confirmed'
    },
    markFailed(state, action: PayloadAction<{ flowId: string; hash: string }>) {
      const list = state.byFlow[action.payload.flowId]
      const rec = list?.find((r) => r.hash === action.payload.hash)
      if (rec) rec.status = 'failed'
    },
    clearFlow(state, action: PayloadAction<{ flowId: string }>) {
      delete state.byFlow[action.payload.flowId]
    },
  },
})

export const { recordSent, markConfirmed, markFailed, clearFlow } = slice.actions

export default slice.reducer

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction } from 'redux-persist'
import { getRehydratePayload } from 'src/redux/persist-helper'
import { BankDetails, BucksPayTransactionStatus } from 'src/buckspay/types'

export type BucksPayFlowStatus =
  | 'idle'
  | 'checking-user'
  | 'sending-crypto'
  | 'submitting-to-api'
  | 'tracking'
  | 'completed'
  | 'error'

export interface State {
  flowStatus: BucksPayFlowStatus
  lastBankDetails: BankDetails | null
  transactionHash: string | null
  bucksPayCode: string | null
  bucksPayStatus: BucksPayTransactionStatus | null
  certificateUrl: string | null
  error: string | null
}

const initialState: State = {
  flowStatus: 'idle',
  lastBankDetails: null,
  transactionHash: null,
  bucksPayCode: null,
  bucksPayStatus: null,
  certificateUrl: null,
  error: null,
}

export const slice = createSlice({
  name: 'buckspay',
  initialState,
  reducers: {
    checkUserStart: (state) => {
      state.flowStatus = 'checking-user'
      state.error = null
    },
    checkUserComplete: (state) => {
      state.flowStatus = 'idle'
    },
    offrampStart: (state, action: PayloadAction<{ bankDetails: BankDetails }>) => {
      state.flowStatus = 'sending-crypto'
      state.lastBankDetails = action.payload.bankDetails
      state.error = null
      state.transactionHash = null
      state.bucksPayCode = null
      state.bucksPayStatus = null
      state.certificateUrl = null
    },
    cryptoSent: (state, action: PayloadAction<{ transactionHash: string }>) => {
      state.flowStatus = 'submitting-to-api'
      state.transactionHash = action.payload.transactionHash
    },
    apiSubmitted: (state, action: PayloadAction<{ code: string }>) => {
      state.flowStatus = 'tracking'
      state.bucksPayCode = action.payload.code
      state.bucksPayStatus = 'PENDING'
    },
    statusUpdated: (
      state,
      action: PayloadAction<{
        status: BucksPayTransactionStatus
        certificateUrl?: string | null
      }>
    ) => {
      state.bucksPayStatus = action.payload.status
      if (action.payload.status === 'FINISHED') {
        state.flowStatus = 'completed'
        state.certificateUrl = action.payload.certificateUrl ?? null
      }
    },
    offrampError: (state, action: PayloadAction<string>) => {
      state.flowStatus = 'error'
      state.error = action.payload
    },
    resetFlow: (state) => {
      state.flowStatus = 'idle'
      state.transactionHash = null
      state.bucksPayCode = null
      state.bucksPayStatus = null
      state.certificateUrl = null
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE, (state, action: RehydrateAction) => ({
      ...state,
      ...getRehydratePayload(action, 'buckspay'),
      // Reset transient state on rehydrate
      flowStatus: 'idle' as const,
      transactionHash: null,
      bucksPayCode: null,
      bucksPayStatus: null,
      certificateUrl: null,
      error: null,
    }))
  },
})

export const {
  checkUserStart,
  checkUserComplete,
  offrampStart,
  cryptoSent,
  apiSubmitted,
  statusUpdated,
  offrampError,
  resetFlow,
} = slice.actions

export default slice.reducer

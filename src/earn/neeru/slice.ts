import { PayloadAction, createSlice } from '@reduxjs/toolkit'
import { NeeruCloseStatus, NeeruFetchStatus, NeeruIndividualPosition } from 'src/earn/neeru/types'

export interface NeeruState {
  fetchStatus: NeeruFetchStatus
  positions: NeeruIndividualPosition[]
  lastSyncedBlock: number | null
  lastSyncedAt: string | null
  closeStatus: NeeruCloseStatus
  closingPositionId: string | null
  lastError: string | null
}

export const initialState: NeeruState = {
  fetchStatus: 'idle',
  positions: [],
  lastSyncedBlock: null,
  lastSyncedAt: null,
  closeStatus: 'idle',
  closingPositionId: null,
  lastError: null,
}

const slice = createSlice({
  name: 'neeru',
  initialState,
  reducers: {
    fetchPositionsStart: (state) => {
      state.fetchStatus = 'loading'
      state.lastError = null
    },
    fetchPositionsSuccess: (
      state,
      action: PayloadAction<{
        positions: NeeruIndividualPosition[]
        lastSyncedBlock: number
        lastSyncedAt: string
      }>
    ) => {
      state.fetchStatus = 'success'
      state.positions = action.payload.positions
      state.lastSyncedBlock = action.payload.lastSyncedBlock
      state.lastSyncedAt = action.payload.lastSyncedAt
    },
    fetchPositionsFailure: (state, action: PayloadAction<{ error: string }>) => {
      state.fetchStatus = 'error'
      state.lastError = action.payload.error
    },
    closePositionStart: (state, action: PayloadAction<{ positionId: string }>) => {
      state.closeStatus = 'loading'
      state.closingPositionId = action.payload.positionId
      state.lastError = null
    },
    closePositionSuccess: (state, action: PayloadAction<{ positionId: string }>) => {
      state.closeStatus = 'success'
      state.closingPositionId = null
      state.positions = state.positions.filter((p) => p.positionId !== action.payload.positionId)
    },
    closePositionFailure: (state, action: PayloadAction<{ positionId: string; error: string }>) => {
      state.closeStatus = 'error'
      state.closingPositionId = null
      state.lastError = action.payload.error
    },
  },
})

export const {
  fetchPositionsStart,
  fetchPositionsSuccess,
  fetchPositionsFailure,
  closePositionStart,
  closePositionSuccess,
  closePositionFailure,
} = slice.actions

export default slice.reducer

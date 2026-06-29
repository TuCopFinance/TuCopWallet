import { PayloadAction, createSlice } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction, getRehydratePayload } from 'src/redux/persist-helper'
import { NeeruCloseStatus, NeeruFetchStatus, NeeruIndividualPosition } from 'src/earn/neeru/types'

export interface NeeruState {
  fetchStatus: NeeruFetchStatus
  positions: NeeruIndividualPosition[]
  optimisticPositions: NeeruIndividualPosition[]
  lastSyncedBlock: number | null
  lastSyncedAt: string | null
  closeStatus: NeeruCloseStatus
  closingPositionId: string | null
  lastError: string | null
}

export const initialState: NeeruState = {
  fetchStatus: 'idle',
  positions: [],
  optimisticPositions: [],
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
    emergencyCloseStart: (state, action: PayloadAction<{ positionId: string }>) => {
      state.closeStatus = 'loading'
      state.closingPositionId = action.payload.positionId
      state.lastError = null
    },
    addOptimisticPosition: (state, action: PayloadAction<NeeruIndividualPosition>) => {
      const incoming = action.payload
      const existingIdx = state.optimisticPositions.findIndex(
        (p) => p.depositTxHash === incoming.depositTxHash
      )
      if (existingIdx >= 0) {
        state.optimisticPositions[existingIdx] = incoming
      } else {
        state.optimisticPositions.push(incoming)
      }
    },
    removeOptimisticPosition: (state, action: PayloadAction<{ depositTxHash: string }>) => {
      state.optimisticPositions = state.optimisticPositions.filter(
        (p) => p.depositTxHash !== action.payload.depositTxHash
      )
    },
    markOptimisticPositionStale: (state, action: PayloadAction<{ depositTxHash: string }>) => {
      const target = state.optimisticPositions.find(
        (p) => p.depositTxHash === action.payload.depositTxHash
      )
      if (target) {
        target.staleOptimistic = true
      }
    },
    clearOptimisticPositions: (state) => {
      state.optimisticPositions = []
    },
  },
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE, (state, action: RehydrateAction) => ({
      ...state,
      ...getRehydratePayload(action, 'neeru'),
      // Always reset transient optimistic state on app start. The
      // backend-truth `positions` array stays as-is from disk so the
      // pre-fetch UI has something to show.
      optimisticPositions: [],
    }))
  },
})

export const {
  fetchPositionsStart,
  fetchPositionsSuccess,
  fetchPositionsFailure,
  closePositionStart,
  closePositionSuccess,
  closePositionFailure,
  emergencyCloseStart,
  addOptimisticPosition,
  removeOptimisticPosition,
  markOptimisticPositionStale,
  clearOptimisticPositions,
} = slice.actions

export default slice.reducer

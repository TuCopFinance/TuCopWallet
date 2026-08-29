import { createSelector } from '@reduxjs/toolkit'
import { NeeruCategoryId } from 'src/earn/neeru/constants'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { RootState } from 'src/redux/store'

const neeruSlice = (state: RootState) => state.neeru

export const neeruFetchStatusSelector = (state: RootState) => neeruSlice(state).fetchStatus
export const neeruCloseStatusSelector = (state: RootState) => neeruSlice(state).closeStatus
export const neeruClosingPositionIdSelector = (state: RootState) =>
  neeruSlice(state).closingPositionId
export const neeruLastErrorSelector = (state: RootState) => neeruSlice(state).lastError

export const neeruEmergencyFallbackByIdSelector = (state: RootState, positionId: string) =>
  neeruSlice(state).pendingEmergencyFallback[positionId]

const neeruBackendPositionsSelector = (state: RootState) => neeruSlice(state).positions
const neeruOptimisticPositionsSelector = (state: RootState) => neeruSlice(state).optimisticPositions

// Merged view: backend positions plus optimistic entries that the
// backend has not surfaced yet, deduped by depositTxHash so a
// confirmed-from-backend deposit replaces its optimistic placeholder.
export const neeruPositionsSelector = createSelector(
  [neeruBackendPositionsSelector, neeruOptimisticPositionsSelector],
  (backend, optimistic): NeeruIndividualPosition[] => {
    if (optimistic.length === 0) return backend
    const backendTxHashes = new Set(backend.map((p) => p.depositTxHash.toLowerCase()))
    const stillPending = optimistic.filter(
      (o) => !backendTxHashes.has(o.depositTxHash.toLowerCase())
    )
    return [...backend, ...stillPending]
  }
)

// Category-indexed map. Populated lazily so a backend that adds a new
// category (Neeru extended from 4 to 6 categories on 2026-08-25) does not
// crash a wallet with hardcoded 0..3 keys. Consumers must default the read
// with `?? []` because a category with zero positions has no entry.
export const neeruPositionsByCategorySelector = createSelector(
  [neeruPositionsSelector],
  (positions): Record<NeeruCategoryId, NeeruIndividualPosition[]> => {
    const acc: Record<NeeruCategoryId, NeeruIndividualPosition[]> = {}
    for (const p of positions) {
      if (!acc[p.category]) acc[p.category] = []
      acc[p.category].push(p)
    }
    return acc
  }
)

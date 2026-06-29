import { createSelector } from '@reduxjs/toolkit'
import { NeeruTrancheId } from 'src/earn/neeru/constants'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { RootState } from 'src/redux/store'

const neeruSlice = (state: RootState) => state.neeru

export const neeruFetchStatusSelector = (state: RootState) => neeruSlice(state).fetchStatus
export const neeruCloseStatusSelector = (state: RootState) => neeruSlice(state).closeStatus
export const neeruClosingPositionIdSelector = (state: RootState) =>
  neeruSlice(state).closingPositionId
export const neeruLastErrorSelector = (state: RootState) => neeruSlice(state).lastError
export const neeruPositionsSelector = (state: RootState) => neeruSlice(state).positions

export const neeruPositionsByTrancheSelector = createSelector(
  [neeruPositionsSelector],
  (positions): Record<NeeruTrancheId, NeeruIndividualPosition[]> => {
    const acc: Record<NeeruTrancheId, NeeruIndividualPosition[]> = {
      0: [],
      1: [],
      2: [],
      3: [],
    }
    for (const p of positions) acc[p.tranche].push(p)
    return acc
  }
)

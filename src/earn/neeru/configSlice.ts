import { PayloadAction, createSlice } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction, getRehydratePayload } from 'src/redux/persist-helper'
import { NeeruCatalogue, NeeruFetchStatus, NeeruMeta } from 'src/earn/neeru/types'

// A backend /meta payload cached longer than this is considered stale and the
// UI surfaces a "modo offline" banner. Backend-owned so a bump on their side
// is detected within 24h regardless of network state on the device.
export const NEERU_META_CACHE_FRESH_MS = 24 * 60 * 60 * 1000

export type NeeruConfigSource = 'backend' | 'cache' | 'fallback'

export interface NeeruConfigState {
  // Meta: persisted with cache + fallback. Structural, rarely changes.
  meta: NeeruMeta | null
  metaSource: NeeruConfigSource | null
  metaFetchedAt: string | null
  metaFetchStatus: NeeruFetchStatus
  metaLastError: string | null

  // Catalogue: runtime-only, not persisted. No fallback: rates fluctuate
  // operationally so stale hardcoded values would mislead the user.
  catalogue: NeeruCatalogue | null
  catalogueFetchStatus: NeeruFetchStatus
  catalogueLastError: string | null
}

export const initialState: NeeruConfigState = {
  meta: null,
  metaSource: null,
  metaFetchedAt: null,
  metaFetchStatus: 'idle',
  metaLastError: null,
  catalogue: null,
  catalogueFetchStatus: 'idle',
  catalogueLastError: null,
}

const slice = createSlice({
  name: 'neeruConfig',
  initialState,
  reducers: {
    fetchMetaStart: (state) => {
      state.metaFetchStatus = 'loading'
      state.metaLastError = null
    },
    fetchMetaSuccess: (state, action: PayloadAction<{ meta: NeeruMeta; fetchedAt: string }>) => {
      state.metaFetchStatus = 'success'
      state.meta = action.payload.meta
      state.metaSource = 'backend'
      state.metaFetchedAt = action.payload.fetchedAt
    },
    fetchMetaFailure: (state, action: PayloadAction<{ error: string }>) => {
      state.metaFetchStatus = 'error'
      state.metaLastError = action.payload.error
    },
    fetchCatalogueStart: (state) => {
      state.catalogueFetchStatus = 'loading'
      state.catalogueLastError = null
    },
    fetchCatalogueSuccess: (state, action: PayloadAction<{ catalogue: NeeruCatalogue }>) => {
      state.catalogueFetchStatus = 'success'
      state.catalogue = action.payload.catalogue
    },
    fetchCatalogueFailure: (state, action: PayloadAction<{ error: string }>) => {
      state.catalogueFetchStatus = 'error'
      state.catalogueLastError = action.payload.error
    },
  },
  extraReducers: (builder) => {
    // After rehydration, preserve the disk-persisted meta but downgrade its
    // source to 'cache' so consumers know it did not come from a fresh backend
    // hit yet. The boot saga will refresh it and upgrade back to 'backend'.
    builder.addCase(REHYDRATE, (state, action: RehydrateAction) => {
      const payload = getRehydratePayload(action, 'neeruConfig') as Partial<NeeruConfigState>
      const merged = { ...state, ...payload }
      return {
        ...merged,
        metaSource: merged.meta ? 'cache' : null,
        metaFetchStatus: 'idle',
        metaLastError: null,
        catalogue: null,
        catalogueFetchStatus: 'idle',
        catalogueLastError: null,
      }
    })
  },
})

export const {
  fetchMetaStart,
  fetchMetaSuccess,
  fetchMetaFailure,
  fetchCatalogueStart,
  fetchCatalogueSuccess,
  fetchCatalogueFailure,
} = slice.actions

export default slice.reducer

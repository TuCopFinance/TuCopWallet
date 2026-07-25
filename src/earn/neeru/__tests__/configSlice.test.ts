import reducer, {
  fetchCatalogueFailure,
  fetchCatalogueSuccess,
  fetchMetaFailure,
  fetchMetaStart,
  fetchMetaSuccess,
  initialState,
  NEERU_META_CACHE_FRESH_MS,
} from 'src/earn/neeru/configSlice'
import {
  NEERU_META_HARDCODED_FALLBACK,
  neeruCatalogueSelector,
  neeruMetaSelector,
} from 'src/earn/neeru/configSelectors'
import { NeeruCatalogue, NeeruMeta } from 'src/earn/neeru/types'
import { RootState } from 'src/redux/reducers'
import { REHYDRATE } from 'src/redux/persist-helper'

const META: NeeruMeta = {
  ...NEERU_META_HARDCODED_FALLBACK,
  version: 'v2-2026-08-01',
}

const CATALOGUE: NeeruCatalogue = {
  categories: [
    { id: 0, secs: '0', rateRay: '1', monthlyRatePercentage: 0.8, annualEffectivePercentage: 10 },
  ],
  token: { address: '0x8a567e2aE79CA692Bd748aB832081C45de4041eA', decimals: 18, symbol: 'COPm' },
  fetchedAt: '2026-07-25T00:00:00.000Z',
}

const buildState = (overrides: Partial<typeof initialState> = {}) =>
  ({ neeruConfig: { ...initialState, ...overrides } }) as unknown as RootState

describe('neeruConfig slice', () => {
  it('marks meta loading on fetchMetaStart', () => {
    const state = reducer(initialState, fetchMetaStart())
    expect(state.metaFetchStatus).toBe('loading')
    expect(state.metaLastError).toBeNull()
  })

  it('stores meta + backend source on fetchMetaSuccess', () => {
    const state = reducer(
      initialState,
      fetchMetaSuccess({ meta: META, fetchedAt: '2026-07-25T00:00:00.000Z' })
    )
    expect(state.meta).toEqual(META)
    expect(state.metaSource).toBe('backend')
    expect(state.metaFetchedAt).toBe('2026-07-25T00:00:00.000Z')
    expect(state.metaFetchStatus).toBe('success')
  })

  it('preserves prior meta on fetchMetaFailure', () => {
    const prior = reducer(
      initialState,
      fetchMetaSuccess({ meta: META, fetchedAt: '2026-07-25T00:00:00.000Z' })
    )
    const state = reducer(prior, fetchMetaFailure({ error: 'network down' }))
    expect(state.meta).toEqual(META)
    expect(state.metaSource).toBe('backend')
    expect(state.metaFetchStatus).toBe('error')
    expect(state.metaLastError).toBe('network down')
  })

  it('stores catalogue on fetchCatalogueSuccess', () => {
    const state = reducer(initialState, fetchCatalogueSuccess({ catalogue: CATALOGUE }))
    expect(state.catalogue).toEqual(CATALOGUE)
    expect(state.catalogueFetchStatus).toBe('success')
  })

  it('does not preserve catalogue on fetchCatalogueFailure (no fallback)', () => {
    const prior = reducer(initialState, fetchCatalogueSuccess({ catalogue: CATALOGUE }))
    const state = reducer(prior, fetchCatalogueFailure({ error: 'timeout' }))
    // Catalogue value stays until the next success, but consumers read the
    // status: hasError=true -> renders skeleton, not stale rates.
    expect(state.catalogueFetchStatus).toBe('error')
    expect(state.catalogueLastError).toBe('timeout')
  })

  it('drops source to cache and resets runtime state on rehydrate with meta', () => {
    const rehydrated = reducer(initialState, {
      type: REHYDRATE,
      key: 'root',
      payload: {
        neeruConfig: {
          meta: META,
          metaSource: 'backend',
          metaFetchedAt: '2026-07-24T00:00:00.000Z',
          catalogue: CATALOGUE,
          catalogueFetchStatus: 'success',
        },
      },
    })
    expect(rehydrated.meta).toEqual(META)
    expect(rehydrated.metaSource).toBe('cache')
    expect(rehydrated.metaFetchStatus).toBe('idle')
    expect(rehydrated.catalogue).toBeNull()
    expect(rehydrated.catalogueFetchStatus).toBe('idle')
  })

  it('leaves source null when rehydrate has no meta', () => {
    const rehydrated = reducer(initialState, {
      type: REHYDRATE,
      key: 'root',
      payload: { neeruConfig: {} },
    })
    expect(rehydrated.meta).toBeNull()
    expect(rehydrated.metaSource).toBeNull()
  })
})

describe('neeruMetaSelector', () => {
  it('returns hardcoded fallback when no meta cached', () => {
    const result = neeruMetaSelector(buildState())
    expect(result.meta).toEqual(NEERU_META_HARDCODED_FALLBACK)
    expect(result.source).toBe('fallback')
    expect(result.isDegraded).toBe(true)
  })

  it('returns backend meta when source is backend (not degraded)', () => {
    const result = neeruMetaSelector(
      buildState({ meta: META, metaSource: 'backend', metaFetchedAt: '2026-07-24T00:00:00.000Z' })
    )
    expect(result.meta).toEqual(META)
    expect(result.source).toBe('backend')
    expect(result.isDegraded).toBe(false)
  })

  it('returns cache meta as not degraded within TTL', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T06:00:00.000Z'))
    const result = neeruMetaSelector(
      buildState({
        meta: META,
        metaSource: 'cache',
        metaFetchedAt: '2026-07-25T00:00:00.000Z',
      })
    )
    expect(result.isDegraded).toBe(false)
    jest.useRealTimers()
  })

  it('marks cache meta as degraded past TTL', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-27T00:00:00.000Z'))
    const result = neeruMetaSelector(
      buildState({
        meta: META,
        metaSource: 'cache',
        metaFetchedAt: '2026-07-25T00:00:00.000Z',
      })
    )
    // 48h > 24h TTL
    expect(result.isDegraded).toBe(true)
    expect(result.source).toBe('cache')
    jest.useRealTimers()
  })

  it('treats a cache row with no fetchedAt as degraded', () => {
    const result = neeruMetaSelector(
      buildState({ meta: META, metaSource: 'cache', metaFetchedAt: null })
    )
    expect(result.isDegraded).toBe(true)
  })

  it('uses the exact TTL boundary', () => {
    const fetchedAt = '2026-07-25T00:00:00.000Z'
    const exactlyAtBoundary = Date.parse(fetchedAt) + NEERU_META_CACHE_FRESH_MS
    jest.useFakeTimers().setSystemTime(new Date(exactlyAtBoundary))
    const result = neeruMetaSelector(
      buildState({ meta: META, metaSource: 'cache', metaFetchedAt: fetchedAt })
    )
    // At the boundary, treated as fresh (ageMs === TTL, not >)
    expect(result.isDegraded).toBe(false)
    jest.useRealTimers()
  })
})

describe('neeruCatalogueSelector', () => {
  it('reports loading and empty catalogue on cold state', () => {
    const result = neeruCatalogueSelector(buildState({ catalogueFetchStatus: 'loading' }))
    expect(result.catalogue).toBeNull()
    expect(result.isLoading).toBe(true)
    expect(result.hasError).toBe(false)
  })

  it('reports catalogue and no error on success', () => {
    const result = neeruCatalogueSelector(
      buildState({ catalogue: CATALOGUE, catalogueFetchStatus: 'success' })
    )
    expect(result.catalogue).toEqual(CATALOGUE)
    expect(result.isLoading).toBe(false)
    expect(result.hasError).toBe(false)
  })

  it('surfaces error status so callers render skeleton', () => {
    const result = neeruCatalogueSelector(buildState({ catalogueFetchStatus: 'error' }))
    expect(result.hasError).toBe(true)
  })
})

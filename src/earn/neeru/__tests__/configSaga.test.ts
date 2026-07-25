import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { fetchNeeruCatalogue, fetchNeeruMeta } from 'src/earn/neeru/api'
import { fetchNeeruCatalogueSaga, fetchNeeruMetaSaga } from 'src/earn/neeru/configSaga'
import {
  fetchCatalogueFailure,
  fetchCatalogueSuccess,
  fetchMetaFailure,
  fetchMetaSuccess,
} from 'src/earn/neeru/configSlice'
import { NEERU_META_HARDCODED_FALLBACK } from 'src/earn/neeru/configSelectors'
import { NeeruCatalogue } from 'src/earn/neeru/types'

const META = { ...NEERU_META_HARDCODED_FALLBACK, version: 'v2-2026-08-01' }
const CATALOGUE: NeeruCatalogue = {
  categories: [
    { id: 0, secs: '0', rateRay: '1', monthlyRatePercentage: 0.8, annualEffectivePercentage: 10 },
  ],
  token: { address: '0x8a567e2aE79CA692Bd748aB832081C45de4041eA', decimals: 18, symbol: 'COPm' },
  fetchedAt: '2026-07-25T00:00:00.000Z',
}

describe('fetchNeeruMetaSaga', () => {
  it('dispatches fetchMetaSuccess on backend OK', async () => {
    const dispatched: any[] = []
    await expectSaga(fetchNeeruMetaSaga)
      .provide([[matchers.call.fn(fetchNeeruMeta), META]])
      .dispatch({ type: 'noop' })
      .run()
      .then((result) => {
        dispatched.push(...result.allEffects)
      })
    // Verify the dispatch via a fresh expectSaga that also asserts the action.
    return expectSaga(fetchNeeruMetaSaga)
      .provide([[matchers.call.fn(fetchNeeruMeta), META]])
      .put.actionType(fetchMetaSuccess.type)
      .run()
  })

  it('dispatches fetchMetaFailure on backend error', async () => {
    return expectSaga(fetchNeeruMetaSaga)
      .provide([[matchers.call.fn(fetchNeeruMeta), Promise.reject(new Error('timeout'))]])
      .put(fetchMetaFailure({ error: 'timeout' }))
      .run()
  })
})

describe('fetchNeeruCatalogueSaga', () => {
  it('dispatches fetchCatalogueSuccess on backend OK', async () => {
    return expectSaga(fetchNeeruCatalogueSaga)
      .provide([[matchers.call.fn(fetchNeeruCatalogue), CATALOGUE]])
      .put(fetchCatalogueSuccess({ catalogue: CATALOGUE }))
      .run()
  })

  it('dispatches fetchCatalogueFailure on backend error', async () => {
    return expectSaga(fetchNeeruCatalogueSaga)
      .provide([[matchers.call.fn(fetchNeeruCatalogue), Promise.reject(new Error('502'))]])
      .put(fetchCatalogueFailure({ error: '502' }))
      .run()
  })
})

import { call, put, spawn, takeLatest } from 'typed-redux-saga'
import { fetchNeeruCatalogue, fetchNeeruMeta } from 'src/earn/neeru/api'
import {
  fetchCatalogueFailure,
  fetchCatalogueStart,
  fetchCatalogueSuccess,
  fetchMetaFailure,
  fetchMetaStart,
  fetchMetaSuccess,
} from 'src/earn/neeru/configSlice'
import networkConfig from 'src/web3/networkConfig'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'

const TAG = 'earn/neeru/configSaga'

export function* fetchNeeruMetaSaga() {
  try {
    const meta = yield* call(fetchNeeruMeta, { baseUrl: networkConfig.tucopBackendApiUrl })
    yield* put(fetchMetaSuccess({ meta, fetchedAt: new Date().toISOString() }))
  } catch (e) {
    const error = ensureError(e)
    Logger.warn(TAG, 'meta fetch failed, cache or fallback will be used', error)
    yield* put(fetchMetaFailure({ error: error.message }))
  }
}

export function* fetchNeeruCatalogueSaga() {
  try {
    const catalogue = yield* call(fetchNeeruCatalogue, {
      baseUrl: networkConfig.tucopBackendApiUrl,
    })
    yield* put(fetchCatalogueSuccess({ catalogue }))
  } catch (e) {
    const error = ensureError(e)
    Logger.warn(TAG, 'catalogue fetch failed, callers will render loading/retry', error)
    yield* put(fetchCatalogueFailure({ error: error.message }))
  }
}

export function* watchFetchNeeruMeta() {
  yield* takeLatest(fetchMetaStart.type, fetchNeeruMetaSaga)
}

export function* watchFetchNeeruCatalogue() {
  yield* takeLatest(fetchCatalogueStart.type, fetchNeeruCatalogueSaga)
}

// Kicks off the meta fetch once at app boot. Catalogue is fetched on-demand
// from the Earn screen so we do not burn a request on users who never open
// the feature.
export function* neeruConfigSaga() {
  yield* spawn(watchFetchNeeruMeta)
  yield* spawn(watchFetchNeeruCatalogue)
  yield* put(fetchMetaStart())
}

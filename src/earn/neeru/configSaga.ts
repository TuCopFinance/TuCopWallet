import * as Sentry from '@sentry/react-native'
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
import { SENTRY_ENABLED } from 'src/config'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import networkConfig from 'src/web3/networkConfig'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'

const TAG = 'earn/neeru/configSaga'

export function* fetchNeeruMetaSaga() {
  try {
    const meta = yield* call(fetchNeeruMeta, { baseUrl: networkConfig.tucopBackendApiUrl })
    yield* put(fetchMetaSuccess({ meta, fetchedAt: new Date().toISOString() }))
    if (SENTRY_ENABLED) {
      // Baseline for the fallback-usage dashboard backend owns. Every
      // successful meta fetch resets the source tag on the current scope so
      // downstream events reflect that the runtime resolver is on 'backend'.
      Sentry.setTag('neeru_meta_source', 'backend')
    }
  } catch (e) {
    const error = ensureError(e)
    Logger.warn(TAG, 'meta fetch failed, cache or fallback will be used', error)
    if (SENTRY_ENABLED) {
      // Failure here does NOT mean the wallet degrades; the resolver picks
      // cache or hardcoded fallback. But we tag every subsequent event so
      // backend can correlate "fallback usage rate > 1% in 24h = backend
      // flaky" with the underlying meta-fetch failures.
      Sentry.setTag('neeru_meta_source', 'fallback_pending')
      captureBusinessError(error, {
        feature: 'earn',
        provider: 'neeru',
        action: 'fetch_meta',
      })
    }
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

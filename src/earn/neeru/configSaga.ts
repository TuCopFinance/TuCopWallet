import * as Sentry from '@sentry/react-native'
import { call, put, select, spawn, takeLatest } from 'typed-redux-saga'
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
import { classifyHttpError } from 'src/sentry/classifyHttpError'
import networkConfig from 'src/web3/networkConfig'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'
import type { RootState } from 'src/redux/reducers'

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
        errorCode: classifyHttpError(error),
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
    captureBusinessError(error, {
      feature: 'earn',
      provider: 'neeru',
      action: 'fetch_catalogue',
      errorCode: classifyHttpError(error),
    })
    yield* put(fetchCatalogueFailure({ error: error.message }))
  }
}

function* watchFetchNeeruMeta() {
  yield* takeLatest(fetchMetaStart.type, fetchNeeruMetaSaga)
}

function* watchFetchNeeruCatalogue() {
  yield* takeLatest(fetchCatalogueStart.type, fetchNeeruCatalogueSaga)
}

// Kicks off the meta fetch once at app boot. Catalogue is fetched on-demand
// from the Earn screen so we do not burn a request on users who never open
// the feature.
export function* neeruConfigSaga() {
  yield* spawn(watchFetchNeeruMeta)
  yield* spawn(watchFetchNeeruCatalogue)
  // If the persisted store already carries a meta from a previous session,
  // tag Sentry with 'cache' so downstream events reflect that the resolver
  // was serving the TTL-fresh cached payload at the moment they happened.
  // fetchMetaStart below may overwrite this to 'backend' (fresh) or
  // 'fallback_pending' (fetch failed) once the round-trip completes.
  if (SENTRY_ENABLED) {
    const rehydrated = yield* select((s: RootState) => s.neeruConfig)
    if (rehydrated.meta && rehydrated.metaSource === 'cache') {
      Sentry.setTag('neeru_meta_source', 'cache')
    }
  }
  yield* put(fetchMetaStart())
}

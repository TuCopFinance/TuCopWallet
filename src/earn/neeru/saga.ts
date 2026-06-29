import { fetchNeeruPositions } from 'src/earn/neeru/api'
import {
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
} from 'src/earn/neeru/slice'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import { call, put, select, spawn, takeLeading } from 'typed-redux-saga'

const TAG = 'earn/neeru/saga'

export function* fetchNeeruPositionsSaga(_action: ReturnType<typeof fetchPositionsStart>) {
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    Logger.warn(TAG, 'no wallet address, skipping fetch')
    return
  }
  try {
    const response = yield* call(fetchNeeruPositions, {
      baseUrl: networkConfig.tucopBackendApiUrl,
      walletAddress,
    })
    yield* put(
      fetchPositionsSuccess({
        positions: response.positions,
        lastSyncedBlock: response.lastSyncedBlock,
        lastSyncedAt: response.lastSyncedAt,
      })
    )
  } catch (e) {
    const error = ensureError(e)
    Logger.error(TAG, 'fetchNeeruPositions failed', error)
    yield* put(fetchPositionsFailure({ error: error.message }))
  }
}

export function* watchFetchNeeruPositions() {
  yield* takeLeading(fetchPositionsStart.type, fetchNeeruPositionsSaga)
}

export function* neeruSaga() {
  yield* spawn(watchFetchNeeruPositions)
}

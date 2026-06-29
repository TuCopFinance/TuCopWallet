import { fetchNeeruPositions } from 'src/earn/neeru/api'
import {
  closePositionFailure,
  closePositionStart,
  closePositionSuccess,
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
} from 'src/earn/neeru/slice'
import { hooksApiUrlSelector } from 'src/positions/selectors'
import { RawShortcutTransaction } from 'src/positions/slice'
import { triggerShortcutRequest } from 'src/positions/saga'
import { rawShortcutTransactionsToTransactionRequests } from 'src/positions/transactions'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'
import { PreparedTransactionsResult, prepareTransactions } from 'src/viem/prepareTransactions'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import { call, put, select, spawn, takeLeading } from 'typed-redux-saga'

const TAG = 'earn/neeru/saga'

export const NEERU_LOW_POOL_ACTION = 'neeru/interestPoolLow' as const

function isLowPoolError(error: Error): boolean {
  return error.message.includes('InterestPoolLow')
}

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

export function* closeNeeruPositionSaga(action: ReturnType<typeof closePositionStart>) {
  const { positionId } = action.payload
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    Logger.warn(TAG, 'no wallet address, skipping close')
    return
  }
  const hooksApiUrl = yield* select(hooksApiUrlSelector)
  const feeCurrencies = yield* select(feeCurrenciesSelector, NetworkId['celo-mainnet'])

  try {
    const response: { transactions: RawShortcutTransaction[] } = yield* call(
      triggerShortcutRequest,
      hooksApiUrl,
      {
        address: walletAddress,
        appId: 'neeru-vaults',
        networkId: NetworkId['celo-mainnet'],
        shortcutId: 'withdraw',
        positionId,
      }
    )
    const prepared: PreparedTransactionsResult = yield* call(prepareTransactions, {
      feeCurrencies,
      baseTransactions: rawShortcutTransactionsToTransactionRequests(response.transactions),
      isGasSubsidized: false,
      origin: 'earn-withdraw' as const,
    })
    if (prepared.type !== 'possible') {
      throw new Error(`Cannot prepare close tx: ${prepared.type}`)
    }
    yield* call(
      sendPreparedTransactions,
      getSerializablePreparedTransactions(prepared.transactions),
      NetworkId['celo-mainnet'],
      []
    )
    yield* put(closePositionSuccess({ positionId }))
  } catch (e) {
    const error = ensureError(e)
    if (isLowPoolError(error)) {
      yield* put({
        type: NEERU_LOW_POOL_ACTION,
        payload: { positionId },
      })
      yield* put(closePositionFailure({ positionId, error: 'InterestPoolLow' }))
      return
    }
    Logger.error(TAG, 'close failed', error)
    yield* put(closePositionFailure({ positionId, error: error.message }))
  }
}

export function* watchCloseNeeruPosition() {
  yield* takeLeading(closePositionStart.type, closeNeeruPositionSaga)
}

export function* neeruSaga() {
  yield* spawn(watchFetchNeeruPositions)
  yield* spawn(watchCloseNeeruPosition)
}

import BigNumber from 'bignumber.js'
import { TransactionReceipt } from 'viem'
import { fetchNeeruPositions } from 'src/earn/neeru/api'
import {
  NEERU_CATEGORY_LABEL_KEYS,
  NEERU_CONTRACT_ADDRESS,
  NEERU_ERR_INTEREST_POOL_LOW_SELECTOR,
  NeeruCategoryId,
} from 'src/earn/neeru/constants'
import { parseDepositEvent } from 'src/earn/neeru/eventParsing'
import { computePayout, monthlyPercentFromRateValue } from 'src/earn/neeru/rateConversion'
import {
  addOptimisticPosition,
  closePositionFailure,
  closePositionStart,
  closePositionSuccess,
  emergencyCloseStart,
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
  markOptimisticPositionStale,
  removeOptimisticPosition,
} from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { hooksApiUrlSelector } from 'src/positions/selectors'
import { RawShortcutTransaction } from 'src/positions/slice'
import { triggerShortcutRequest } from 'src/positions/saga'
import { rawShortcutTransactionsToTransactionRequests } from 'src/positions/transactions'
import { reorderForBugE } from 'src/tokens/feeCurrencyPicker'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'
import { PreparedTransactionsResult, prepareTransactions } from 'src/viem/prepareTransactions'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import { call, delay, put, race, select, spawn, takeLeading } from 'typed-redux-saga'

const TAG = 'earn/neeru/saga'

// Wallet-internal signals for the low-interest-pool code path. Kept opaque
// (no contract-error-name mirror) so the wallet repo does not identify the
// underlying revert reason in tracked source.
export const NEERU_LOW_POOL_ACTION = 'neeru/lowPool' as const
export const NEERU_LOW_POOL_ERROR = 'neeru:low-pool' as const

const NEERU_OPTIMISTIC_POLL_INTERVAL_MS = 15_000
const NEERU_OPTIMISTIC_TIMEOUT_MS = 5 * 60_000

const CATEGORY_DURATION_SECONDS: Record<NeeruCategoryId, number> = {
  0: 0,
  1: 30 * 86_400,
  2: 60 * 86_400,
  3: 90 * 86_400,
}

// Match the low-interest-pool custom-error selector. viem surfaces custom
// error reverts as raw hex in cause.data / cause.details / message when the
// wallet does not embed the source ABI; matching the 4-byte selector keeps
// the detection working without exposing the error name.
export function isLowPoolError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const selector = NEERU_ERR_INTEREST_POOL_LOW_SELECTOR.toLowerCase()
  const msg = error.message ?? ''
  const cause = (error as { cause?: { data?: unknown; details?: unknown } }).cause
  const candidates: unknown[] = [cause?.data, cause?.details, msg]
  for (const c of candidates) {
    if (typeof c === 'string' && c.toLowerCase().includes(selector)) return true
  }
  return false
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
  // Bug E: stables ahead of CELO so the Neeru open/close path doesn't burn a
  // hidden CELO balance to pay gas.
  const feeCurrencies = reorderForBugE(
    yield* select(feeCurrenciesSelector, NetworkId['celo-mainnet'])
  )

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
      yield* put(closePositionFailure({ positionId, error: NEERU_LOW_POOL_ERROR }))
      return
    }
    Logger.error(TAG, 'close failed', error)
    yield* put(closePositionFailure({ positionId, error: error.message }))
  }
}

export function* watchCloseNeeruPosition() {
  yield* takeLeading(closePositionStart.type, closeNeeruPositionSaga)
}

export function* emergencyCloseNeeruPositionSaga(action: ReturnType<typeof emergencyCloseStart>) {
  const { positionId } = action.payload
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    Logger.warn(TAG, 'no wallet address, skipping emergency close')
    return
  }
  const hooksApiUrl = yield* select(hooksApiUrlSelector)
  // Bug E: stables ahead of CELO so the Neeru open/close path doesn't burn a
  // hidden CELO balance to pay gas.
  const feeCurrencies = reorderForBugE(
    yield* select(feeCurrenciesSelector, NetworkId['celo-mainnet'])
  )

  try {
    const response: { transactions: RawShortcutTransaction[] } = yield* call(
      triggerShortcutRequest,
      hooksApiUrl,
      {
        address: walletAddress,
        appId: 'neeru-vaults',
        networkId: NetworkId['celo-mainnet'],
        shortcutId: 'withdraw-amount-only',
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
      throw new Error(`Cannot prepare emergency tx: ${prepared.type}`)
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
    Logger.error(TAG, 'emergency close failed', error)
    yield* put(closePositionFailure({ positionId, error: error.message }))
  }
}

export function* watchEmergencyCloseNeeruPosition() {
  yield* takeLeading(emergencyCloseStart.type, emergencyCloseNeeruPositionSaga)
}

function buildOptimisticPosition({
  txHash,
  blockNumber,
  category,
  amountRaw,
  rateValue,
}: {
  txHash: string
  blockNumber: number
  category: NeeruCategoryId
  amountRaw: string
  rateValue: string
}): NeeruIndividualPosition {
  const amountDecimal = new BigNumber(amountRaw).shiftedBy(-18).toFixed()
  const startTs = Math.floor(Date.now() / 1000)
  const endTs = category === 0 ? 0 : startTs + CATEGORY_DURATION_SECONDS[category]
  return {
    positionId: `optimistic:${txHash}`,
    category,
    categoryLabel: NEERU_CATEGORY_LABEL_KEYS[category],
    amount: amountDecimal,
    accruedInterest: '0',
    rateValue,
    monthlyRatePercentage: monthlyPercentFromRateValue(rateValue),
    startTs,
    endTs,
    depositBlock: blockNumber,
    depositTxHash: txHash,
    renewedFromPositionId: null,
    currentPayoutIfClosed: computePayout({
      amount: amountDecimal,
      accruedInterest: '0',
      penaltyBps: 0,
      isEarly: category !== 0,
    }),
    optimistic: true,
    staleOptimistic: false,
  }
}

export function* pollUntilBackendCatchesUp({
  baseUrl,
  walletAddress,
  txHash,
}: {
  baseUrl: string
  walletAddress: string
  txHash: string
}): Generator<any, true, any> {
  while (true) {
    yield* delay(NEERU_OPTIMISTIC_POLL_INTERVAL_MS)
    try {
      const response = yield* call(fetchNeeruPositions, { baseUrl, walletAddress })
      const found = response.positions.find(
        (p) => p.depositTxHash.toLowerCase() === txHash.toLowerCase()
      )
      if (found) {
        yield* put(
          fetchPositionsSuccess({
            positions: response.positions,
            lastSyncedBlock: response.lastSyncedBlock,
            lastSyncedAt: response.lastSyncedAt,
          })
        )
        return true
      }
    } catch (e) {
      const err = ensureError(e)
      Logger.warn(TAG, 'optimistic poll failed; will retry', err)
    }
  }
}

// Extracted so tests can mock this single call() and control the race
// outcome deterministically without timing-sensitive plumbing.
export function* awaitOptimisticResolution(args: {
  baseUrl: string
  walletAddress: string
  txHash: string
}): Generator<any, 'matched' | 'timedOut', any> {
  const result = yield* race({
    matched: call(pollUntilBackendCatchesUp, args),
    timedOut: delay(NEERU_OPTIMISTIC_TIMEOUT_MS),
  })
  return result.matched ? 'matched' : 'timedOut'
}

export function* handleNeeruDepositOptimistic(receipt: TransactionReceipt) {
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    Logger.warn(TAG, 'no wallet address, skipping optimistic flow')
    return
  }
  const parsed = parseDepositEvent(receipt, NEERU_CONTRACT_ADDRESS)
  if (!parsed) {
    Logger.warn(TAG, 'no deposit event in receipt; falling back to normal fetch', {
      tx: receipt.transactionHash,
    })
    yield* put(fetchPositionsStart())
    return
  }
  const category = parsed.category
  if (category < 0 || category > 3) {
    Logger.warn(TAG, 'category out of range in deposit event', { category })
    return
  }
  const txHash = receipt.transactionHash.toLowerCase()
  const optimistic = buildOptimisticPosition({
    txHash,
    blockNumber: Number(receipt.blockNumber),
    category: category as NeeruCategoryId,
    amountRaw: parsed.amount,
    rateValue: parsed.rateValue,
  })
  yield* put(addOptimisticPosition(optimistic))

  const baseUrl = networkConfig.tucopBackendApiUrl
  const outcome = yield* call(awaitOptimisticResolution, {
    baseUrl,
    walletAddress,
    txHash,
  })

  if (outcome === 'matched') {
    yield* put(removeOptimisticPosition({ depositTxHash: txHash }))
  } else {
    Logger.warn(TAG, 'optimistic deposit not surfaced by backend within timeout', { tx: txHash })
    yield* put(markOptimisticPositionStale({ depositTxHash: txHash }))
  }
}

export function* neeruSaga() {
  yield* spawn(watchFetchNeeruPositions)
  yield* spawn(watchCloseNeeruPosition)
  yield* spawn(watchEmergencyCloseNeeruPosition)
}

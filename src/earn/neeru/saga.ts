import BigNumber from 'bignumber.js'
import { TransactionReceipt } from 'viem'
import { fetchNeeruPositions } from 'src/earn/neeru/api'
import { neeruConfigSaga } from 'src/earn/neeru/configSaga'
import {
  NEERU_CATEGORY_LABEL_KEYS,
  NEERU_CONTRACT_ADDRESS,
  NEERU_ERR_ALREADY_CLOSED_SELECTOR,
  NEERU_ERR_INTEREST_POOL_LOW_SELECTOR,
  NEERU_ERR_NOT_OWNER_SELECTOR,
  NeeruCategoryId,
} from 'src/earn/neeru/constants'
import { parseDepositEvent } from 'src/earn/neeru/eventParsing'
import { computePayout, monthlyPercentFromRateValue } from 'src/earn/neeru/rateConversion'
import {
  addOptimisticPosition,
  clearEmergencyFallback,
  closePositionFailure,
  closePositionStart,
  closePositionSuccess,
  emergencyCloseStart,
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
  markOptimisticPositionStale,
  removeOptimisticPosition,
  setEmergencyFallback,
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
import { publicClient } from 'src/viem'
import {
  PreparedTransactionsResult,
  prepareTransactions,
  TransactionRequest,
} from 'src/viem/prepareTransactions'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import { vibrateSuccess } from 'src/styles/hapticFeedback'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import networkConfig, { COPM_TOKEN_ID_MAINNET, networkIdToNetwork } from 'src/web3/networkConfig'
import {
  neeruEmergencyFallbackByIdSelector,
  neeruPositionsSelector,
} from 'src/earn/neeru/selectors'
import { walletAddressSelector } from 'src/web3/selectors'
import { call, delay, put, race, select, spawn, takeLeading } from 'typed-redux-saga'

const TAG = 'earn/neeru/saga'

// Wallet-internal signals for withdraw revert paths. Kept opaque (no
// contract-error-name mirror) so the wallet repo does not identify the
// underlying revert reasons in tracked source. Matched by selector against
// what the backend simulation returns or what the on-chain replay surfaces.
export const NEERU_LOW_POOL_ACTION = 'neeru/lowPool' as const
export const NEERU_LOW_POOL_ERROR = 'neeru:low-pool' as const
export const NEERU_ALREADY_CLOSED_ERROR = 'neeru:already-closed' as const
export const NEERU_NOT_OWNER_ERROR = 'neeru:not-owner' as const
export const NEERU_UNKNOWN_REVERT_ERROR = 'neeru:unknown-revert' as const

// Envelope handed back by the hooks-api triggerShortcut. The
// simulationRevert + fallback keys land in `dataProps` when the backend
// pre-simulated the withdraw and it would revert; the wallet consumes them
// to short-circuit the sign flow without paying gas.
interface SimulationRevertInfo {
  selector?: string
  reason?: string
}
interface FallbackInfo {
  shortcutId?: string
  transactions?: RawShortcutTransaction[]
}
interface TriggerShortcutResponseData {
  transactions: RawShortcutTransaction[]
  dataProps?: {
    simulationRevert?: SimulationRevertInfo
    fallback?: FallbackInfo
  }
}

// Match the raw selector on the simulationRevert envelope against the three
// known 4-byte error selectors from the vault contract. Returns an opaque
// tag so callers can branch UX without leaking the contract error name.
export function classifySimulationRevert(
  simulationRevert: SimulationRevertInfo | undefined
): 'low_pool' | 'already_closed' | 'not_owner' | 'unknown' | null {
  if (!simulationRevert) return null
  const selector = (simulationRevert.selector ?? '').toLowerCase()
  if (!selector) return 'unknown'
  if (selector === NEERU_ERR_INTEREST_POOL_LOW_SELECTOR.toLowerCase()) return 'low_pool'
  if (selector === NEERU_ERR_ALREADY_CLOSED_SELECTOR.toLowerCase()) return 'already_closed'
  if (selector === NEERU_ERR_NOT_OWNER_SELECTOR.toLowerCase()) return 'not_owner'
  return 'unknown'
}

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

// Wait for the on-chain receipts of every tx we just sent. If any one reverted,
// re-run it as an eth_call at the reverted block to surface the custom-error
// selector (viem attaches it to cause.data / cause.details), then throw an
// Error whose shape the isLowPoolError matcher above understands.
export function* enforceReceiptsOrThrow({
  txHashes,
  baseTransactions,
  walletAddress,
  networkId,
}: {
  txHashes: `0x${string}`[]
  baseTransactions: TransactionRequest[]
  walletAddress: string
  networkId: NetworkId
}): Generator<any, void, any> {
  const network = networkIdToNetwork[networkId]
  const client = publicClient[network]
  for (let i = 0; i < txHashes.length; i++) {
    const receipt: TransactionReceipt = yield* call([client, 'waitForTransactionReceipt'], {
      hash: txHashes[i],
    })
    if (receipt.status === 'success') continue
    // Reverted: replay against `latest` (not the receipt block, Forno frequently
    // rejects historical block state with "block is out of range") to extract
    // the revert data. The Neeru contract state that drove the revert (low
    // interest pool) persists across blocks, so re-simulating now reproduces
    // the same custom error and surfaces the selector on cause.data.
    let revertData: string | undefined
    try {
      const base = baseTransactions[i] as { to?: `0x${string}`; data?: `0x${string}` }
      yield* call([client, 'call'], {
        account: walletAddress as `0x${string}`,
        to: base.to,
        data: base.data,
      })
    } catch (callError) {
      // viem attaches revert data under different keys depending on how the
      // node returned it. Walk a few common shapes.
      const anyErr = callError as {
        cause?: { data?: unknown; details?: unknown; cause?: { data?: unknown } }
        message?: string
      }
      const candidates: unknown[] = [
        anyErr?.cause?.data,
        anyErr?.cause?.cause?.data,
        anyErr?.cause?.details,
        anyErr?.message,
      ]
      for (const c of candidates) {
        if (typeof c !== 'string') continue
        // Prefer a bare 4-byte selector if present, else keep the full string
        // so the LOW_POOL matcher below (substring match) still works.
        const selectorMatch = c.match(/0x[0-9a-fA-F]{8}(?![0-9a-fA-F])/)
        if (selectorMatch) {
          revertData = selectorMatch[0]
          break
        }
        if (!revertData) revertData = c
      }
    }
    const err = new Error(`tx reverted on-chain (${revertData ?? 'no revert data'})`)
    ;(err as { cause?: { data?: string; details?: string } }).cause = {
      data: revertData,
      details: revertData,
    }
    throw err
  }
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
    const response: TriggerShortcutResponseData = yield* call(triggerShortcutRequest, hooksApiUrl, {
      address: walletAddress,
      appId: 'neeru-vaults',
      networkId: NetworkId['celo-mainnet'],
      shortcutId: 'withdraw',
      positionId,
    })
    // Backend pre-simulates the withdraw and, when it would revert, returns
    // `transactions: []` plus `dataProps.simulationRevert` (and optionally a
    // pre-built amount-only fallback the wallet can use without a second
    // triggerShortcut round-trip). Short-circuit before signing anything.
    if (response.transactions.length === 0) {
      const category = classifySimulationRevert(response.dataProps?.simulationRevert)
      if (category === 'low_pool') {
        const fallbackTxs = response.dataProps?.fallback?.transactions ?? []
        if (fallbackTxs.length > 0) {
          yield* put(setEmergencyFallback({ positionId, transactions: fallbackTxs }))
        }
        yield* put({ type: NEERU_LOW_POOL_ACTION, payload: { positionId } })
        yield* put(closePositionFailure({ positionId, error: NEERU_LOW_POOL_ERROR }))
        return
      }
      if (category === 'already_closed') {
        yield* put(closePositionFailure({ positionId, error: NEERU_ALREADY_CLOSED_ERROR }))
        return
      }
      if (category === 'not_owner') {
        yield* put(closePositionFailure({ positionId, error: NEERU_NOT_OWNER_ERROR }))
        return
      }
      // Unknown selector or no simulationRevert at all: refuse to succeed
      // silently. This also protects wallets against a stray empty-transactions
      // response with no explanation.
      yield* put(closePositionFailure({ positionId, error: NEERU_UNKNOWN_REVERT_ERROR }))
      return
    }
    const baseTransactions = rawShortcutTransactionsToTransactionRequests(response.transactions)
    const prepared: PreparedTransactionsResult = yield* call(prepareTransactions, {
      feeCurrencies,
      baseTransactions,
      isGasSubsidized: false,
      origin: 'earn-withdraw' as const,
    })
    if (prepared.type !== 'possible') {
      throw new Error(`Cannot prepare close tx: ${prepared.type}`)
    }
    // sendPreparedTransactions requires one standby-tx creator per prepared
    // tx. Shortcut-driven flows don't have the metadata to build meaningful
    // standby entries, so return null per tx (same pattern as positions/saga).
    const serialized = getSerializablePreparedTransactions(prepared.transactions)
    const txHashes: `0x${string}`[] = yield* call(
      sendPreparedTransactions,
      serialized,
      NetworkId['celo-mainnet'],
      serialized.map(() => () => null)
    )
    // sendPreparedTransactions only confirms the tx made it to the mempool; if
    // the on-chain execution reverts, the promise still resolves. Wait for the
    // receipt and re-run as eth_call to surface the revert selector so the
    // catch below can route into the emergency (amount-only) flow.
    yield* enforceReceiptsOrThrow({
      txHashes,
      baseTransactions,
      walletAddress,
      networkId: NetworkId['celo-mainnet'],
    })
    const positions = yield* select(neeruPositionsSelector)
    const closed = positions.find((p) => p.positionId === positionId)
    const withdrawAmount = closed?.currentPayoutIfClosed.total ?? '0'
    yield* put(closePositionSuccess({ positionId }))
    yield* put(fetchPositionsStart())
    vibrateSuccess()
    navigate(Screens.TransactionSuccessScreen, {
      fromTokenId: COPM_TOKEN_ID_MAINNET,
      toTokenId: COPM_TOKEN_ID_MAINNET,
      fromAmount: withdrawAmount,
      toAmount: withdrawAmount,
      transactionHash: txHashes[txHashes.length - 1],
      networkId: NetworkId['celo-mainnet'],
      type: 'earnWithdraw' as const,
      poolName: 'Neeru Vaults',
    })
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
    // If the close saga already received a pre-built amount-only fallback
    // (backend simulation-first path), use it directly instead of paying
    // another triggerShortcut round-trip. Fall back to a fresh trigger call
    // when the emergency was reached via the wallet-side receipt-check
    // safety net, which does not have the pre-built calldata.
    const stashedFallback = yield* select(neeruEmergencyFallbackByIdSelector, positionId)
    let rawTransactions: RawShortcutTransaction[]
    if (stashedFallback && stashedFallback.length > 0) {
      rawTransactions = stashedFallback
      yield* put(clearEmergencyFallback({ positionId }))
    } else {
      const response: TriggerShortcutResponseData = yield* call(
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
      rawTransactions = response.transactions
    }
    const baseTransactions = rawShortcutTransactionsToTransactionRequests(rawTransactions)
    const prepared: PreparedTransactionsResult = yield* call(prepareTransactions, {
      feeCurrencies,
      baseTransactions,
      isGasSubsidized: false,
      origin: 'earn-withdraw' as const,
    })
    if (prepared.type !== 'possible') {
      throw new Error(`Cannot prepare emergency tx: ${prepared.type}`)
    }
    // sendPreparedTransactions requires one standby-tx creator per prepared
    // tx. Shortcut-driven flows don't have the metadata to build meaningful
    // standby entries, so return null per tx (same pattern as positions/saga).
    const serialized = getSerializablePreparedTransactions(prepared.transactions)
    const txHashes: `0x${string}`[] = yield* call(
      sendPreparedTransactions,
      serialized,
      NetworkId['celo-mainnet'],
      serialized.map(() => () => null)
    )
    yield* enforceReceiptsOrThrow({
      txHashes,
      baseTransactions,
      walletAddress,
      networkId: NetworkId['celo-mainnet'],
    })
    const positions = yield* select(neeruPositionsSelector)
    const closed = positions.find((p) => p.positionId === positionId)
    // Emergency returns only the principal (no interest paid because the pool
    // was low). Match the amount the user just saw in the sheet.
    const returnedAmount = closed?.amount ?? '0'
    yield* put(closePositionSuccess({ positionId }))
    yield* put(fetchPositionsStart())
    vibrateSuccess()
    navigate(Screens.TransactionSuccessScreen, {
      fromTokenId: COPM_TOKEN_ID_MAINNET,
      toTokenId: COPM_TOKEN_ID_MAINNET,
      fromAmount: returnedAmount,
      toAmount: returnedAmount,
      transactionHash: txHashes[txHashes.length - 1],
      networkId: NetworkId['celo-mainnet'],
      type: 'earnWithdraw' as const,
      poolName: 'Neeru Vaults',
    })
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
  yield* spawn(neeruConfigSaga)
  yield* spawn(watchFetchNeeruPositions)
  yield* spawn(watchCloseNeeruPosition)
  yield* spawn(watchEmergencyCloseNeeruPosition)
}

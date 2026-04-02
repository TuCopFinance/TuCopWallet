import { PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import { fetchGoldPriceWithFallback } from 'src/gold/api'
import { enabledPriceAlertsSelector } from 'src/gold/selectors'
import {
  buyGoldError,
  buyGoldStart,
  buyGoldSuccess,
  fetchGoldPrice,
  fetchGoldPriceError,
  markAlertTriggered,
  sellGoldError,
  sellGoldStart,
  sellGoldSuccess,
  setGoldPrice,
} from 'src/gold/slice'
import {
  GoldBuyInfo,
  GoldSellInfo,
  PriceAlert,
  XAUT0_DECIMALS,
  XAUT0_NAME,
  XAUT0_SYMBOL,
} from 'src/gold/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { CANCELLED_PIN_INPUT } from 'src/pincode/authentication'
import { vibrateError, vibrateSuccess } from 'src/styles/hapticFeedback'
import { tokensByIdSelector } from 'src/tokens/selectors'
import { importToken } from 'src/tokens/slice'
import { getSupportedNetworkIdsForSwap } from 'src/tokens/utils'
import { BaseStandbyTransaction } from 'src/transactions/slice'
import { NetworkId, TokenTransactionTypeV2, newTransactionContext } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'
import { safely } from 'src/utils/safely'
import { publicClient } from 'src/viem'
import { getPreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import { getNetworkFromNetworkId } from 'src/web3/utils'
import { call, put, select, takeEvery, takeLeading } from 'typed-redux-saga'
import { decodeFunctionData, erc20Abi } from 'viem'

const TAG = 'gold/saga'

/**
 * Fetch gold price from API and update Redux state
 */
function* fetchGoldPriceSaga() {
  try {
    Logger.debug(TAG, 'Fetching gold price')
    const priceData = yield* call(fetchGoldPriceWithFallback)

    yield* put(setGoldPrice(priceData))

    AppAnalytics.track(GoldEvents.gold_price_fetch_success, {
      price: priceData.priceUsd,
    })

    // Check price alerts
    yield* call(checkPriceAlertsSaga, priceData.priceUsd)
  } catch (error: any) {
    Logger.error(TAG, 'Failed to fetch gold price', error)
    yield* put(fetchGoldPriceError(error.message || 'Failed to fetch gold price'))

    AppAnalytics.track(GoldEvents.gold_price_fetch_error, {
      error: error.message || 'Unknown error',
    })
  }
}

/**
 * Check enabled price alerts against current price
 */
function* checkPriceAlertsSaga(currentPrice: number) {
  const enabledAlerts: PriceAlert[] = yield* select(enabledPriceAlertsSelector)

  for (const alert of enabledAlerts) {
    const shouldTrigger =
      (alert.direction === 'above' && currentPrice >= alert.targetPrice) ||
      (alert.direction === 'below' && currentPrice <= alert.targetPrice)

    if (shouldTrigger) {
      Logger.info(TAG, `Price alert triggered: ${alert.id}, target: ${alert.targetPrice}`)
      yield* put(markAlertTriggered(alert.id))

      AppAnalytics.track(GoldEvents.gold_price_alert_triggered, {
        alertId: alert.id,
        targetPrice: alert.targetPrice,
      })

      // TODO: Show notification to user
      // Could use local notifications here
    }
  }
}

/**
 * Execute gold buy transaction
 */
function* buyGoldSaga(action: PayloadAction<GoldBuyInfo>) {
  const { fromTokenId, fromAmount, quote } = action.payload
  const { preparedTransactions: serializablePreparedTransactions, toAmount } = quote

  const tokensById = yield* select((state) =>
    tokensByIdSelector(state, getSupportedNetworkIdsForSwap())
  )
  const fromToken = tokensById[fromTokenId]

  if (!fromToken) {
    Logger.error(TAG, `Could not find from token: ${fromTokenId}`)
    yield* put(buyGoldError('Token not found'))
    return
  }

  const networkId = fromToken.networkId
  const network = getNetworkFromNetworkId(networkId)

  if (!network) {
    Logger.error(TAG, 'Unknown network')
    yield* put(buyGoldError('Unknown network'))
    return
  }

  const buyApproveContext = newTransactionContext(TAG, 'GoldBuy/Approve')
  const buyExecuteContext = newTransactionContext(TAG, 'GoldBuy/Execute')

  const preparedTransactions = getPreparedTransactions(serializablePreparedTransactions)

  try {
    AppAnalytics.track(GoldEvents.gold_buy_submit_start, {
      amount: fromAmount,
    })

    const createStandbyTxHandlers: ((
      transactionHash: string,
      feeCurrencyId?: string
    ) => BaseStandbyTransaction | null)[] = []

    // If there are 2 transactions, the first should be an approval
    if (preparedTransactions.length > 1 && preparedTransactions[0].data) {
      try {
        const { functionName, args } = yield* call(decodeFunctionData, {
          abi: erc20Abi,
          data: preparedTransactions[0].data,
        })
        if (
          functionName === 'approve' &&
          preparedTransactions[0].to === fromToken.address &&
          args
        ) {
          const approvedAmountInSmallestUnit = args[1] as bigint
          const approvedAmount = new BigNumber(approvedAmountInSmallestUnit.toString())
            .shiftedBy(-fromToken.decimals)
            .toString()

          const createApprovalStandbyTx = (
            transactionHash: string,
            feeCurrencyId?: string
          ): BaseStandbyTransaction => ({
            context: buyApproveContext,
            networkId,
            type: TokenTransactionTypeV2.Approval,
            transactionHash,
            tokenId: fromToken.tokenId,
            approvedAmount,
            feeCurrencyId,
          })
          createStandbyTxHandlers.push(createApprovalStandbyTx)
        }
      } catch (e) {
        Logger.warn(TAG, 'Could not decode approval transaction', e)
      }
    }

    // Add swap standby transaction handler
    const xautAmountFormatted = new BigNumber(toAmount).shiftedBy(-XAUT0_DECIMALS).toString()
    const fromAmountFormatted = new BigNumber(fromAmount).toString()

    const createSwapStandbyTx = (
      transactionHash: string,
      feeCurrencyId?: string
    ): BaseStandbyTransaction => ({
      context: buyExecuteContext,
      networkId,
      type: TokenTransactionTypeV2.SwapTransaction,
      inAmount: {
        value: xautAmountFormatted,
        tokenId: quote.toTokenId,
      },
      outAmount: {
        value: fromAmountFormatted,
        tokenId: fromTokenId,
      },
      transactionHash,
      feeCurrencyId,
    })
    createStandbyTxHandlers.push(createSwapStandbyTx)

    // Send transactions
    const txHashes = yield* call(
      sendPreparedTransactions,
      serializablePreparedTransactions,
      networkId,
      createStandbyTxHandlers
    )

    Logger.debug(TAG, 'Successfully sent gold buy transaction(s)', txHashes)

    // Wait for the swap transaction receipt
    const swapTxHash = txHashes[txHashes.length - 1]
    const txReceipt = yield* call([publicClient[network], 'waitForTransactionReceipt'], {
      hash: swapTxHash,
    })

    if (txReceipt.status !== 'success') {
      throw new Error(`Gold buy transaction reverted: ${swapTxHash}`)
    }

    yield* put(buyGoldSuccess({ txHash: swapTxHash }))

    // Import XAUt0 token so it shows in wallet
    yield* put(
      importToken({
        tokenId: networkConfig.xaut0TokenId,
        address: '0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff',
        networkId: NetworkId['celo-mainnet'],
        decimals: XAUT0_DECIMALS,
        symbol: XAUT0_SYMBOL,
        name: XAUT0_NAME,
        balance: null, // Will be fetched
        priceFetchedAt: Date.now(),
        imageUrl:
          'https://raw.githubusercontent.com/valora-inc/address-metadata/main/assets/tokens/XAUt.png',
      })
    )

    // Show success vibration and navigate to success screen
    vibrateSuccess()
    navigate(Screens.TransactionSuccessScreen, {
      fromTokenId,
      toTokenId: quote.toTokenId,
      fromAmount,
      toAmount: new BigNumber(toAmount).shiftedBy(-XAUT0_DECIMALS).toString(),
      transactionHash: swapTxHash,
      networkId,
      type: 'goldBuy' as const,
    })

    AppAnalytics.track(GoldEvents.gold_buy_submit_success, {
      amount: fromAmount,
      txHash: swapTxHash,
    })
  } catch (err) {
    if (err === CANCELLED_PIN_INPUT) {
      Logger.info(TAG, 'Gold buy cancelled by user')
      yield* put(buyGoldError('Cancelled'))
      return
    }

    const error = ensureError(err)
    Logger.error(TAG, 'Error buying gold', error)
    vibrateError()
    yield* put(buyGoldError(error.message))

    AppAnalytics.track(GoldEvents.gold_buy_submit_error, {
      amount: fromAmount,
      error: error.message,
    })
  }
}

/**
 * Execute gold sell transaction
 */
function* sellGoldSaga(action: PayloadAction<GoldSellInfo>) {
  const { toTokenId, xautAmount, quote } = action.payload
  const { preparedTransactions: serializablePreparedTransactions, toAmount, fromTokenId } = quote

  const tokensById = yield* select((state) =>
    tokensByIdSelector(state, getSupportedNetworkIdsForSwap())
  )
  const toToken = tokensById[toTokenId]

  if (!toToken) {
    Logger.error(TAG, `Could not find to token: ${toTokenId}`)
    yield* put(sellGoldError('Token not found'))
    return
  }

  const networkId = toToken.networkId
  const network = getNetworkFromNetworkId(networkId)

  if (!network) {
    Logger.error(TAG, 'Unknown network')
    yield* put(sellGoldError('Unknown network'))
    return
  }

  const sellApproveContext = newTransactionContext(TAG, 'GoldSell/Approve')
  const sellExecuteContext = newTransactionContext(TAG, 'GoldSell/Execute')

  const preparedTransactions = getPreparedTransactions(serializablePreparedTransactions)

  try {
    AppAnalytics.track(GoldEvents.gold_sell_submit_start, {
      amount: xautAmount,
    })

    const createStandbyTxHandlers: ((
      transactionHash: string,
      feeCurrencyId?: string
    ) => BaseStandbyTransaction | null)[] = []

    // If there are 2 transactions, the first should be an approval
    if (preparedTransactions.length > 1 && preparedTransactions[0].data) {
      try {
        const { functionName, args } = yield* call(decodeFunctionData, {
          abi: erc20Abi,
          data: preparedTransactions[0].data,
        })
        if (functionName === 'approve' && args) {
          const approvedAmountInSmallestUnit = args[1] as bigint
          const approvedAmount = new BigNumber(approvedAmountInSmallestUnit.toString())
            .shiftedBy(-XAUT0_DECIMALS)
            .toString()

          const createApprovalStandbyTx = (
            transactionHash: string,
            feeCurrencyId?: string
          ): BaseStandbyTransaction => ({
            context: sellApproveContext,
            networkId,
            type: TokenTransactionTypeV2.Approval,
            transactionHash,
            tokenId: fromTokenId,
            approvedAmount,
            feeCurrencyId,
          })
          createStandbyTxHandlers.push(createApprovalStandbyTx)
        }
      } catch (e) {
        Logger.warn(TAG, 'Could not decode approval transaction', e)
      }
    }

    // Add swap standby transaction handler
    const toAmountFormatted = new BigNumber(toAmount).shiftedBy(-toToken.decimals).toString()
    const xautAmountFormatted = new BigNumber(xautAmount).toString()

    const createSwapStandbyTx = (
      transactionHash: string,
      feeCurrencyId?: string
    ): BaseStandbyTransaction => ({
      context: sellExecuteContext,
      networkId,
      type: TokenTransactionTypeV2.SwapTransaction,
      inAmount: {
        value: toAmountFormatted,
        tokenId: toTokenId,
      },
      outAmount: {
        value: xautAmountFormatted,
        tokenId: fromTokenId,
      },
      transactionHash,
      feeCurrencyId,
    })
    createStandbyTxHandlers.push(createSwapStandbyTx)

    // Send transactions
    const txHashes = yield* call(
      sendPreparedTransactions,
      serializablePreparedTransactions,
      networkId,
      createStandbyTxHandlers
    )

    Logger.debug(TAG, 'Successfully sent gold sell transaction(s)', txHashes)

    // Wait for the swap transaction receipt
    const swapTxHash = txHashes[txHashes.length - 1]
    const txReceipt = yield* call([publicClient[network], 'waitForTransactionReceipt'], {
      hash: swapTxHash,
    })

    if (txReceipt.status !== 'success') {
      throw new Error(`Gold sell transaction reverted: ${swapTxHash}`)
    }

    yield* put(sellGoldSuccess({ txHash: swapTxHash }))

    // Show success vibration and navigate to success screen
    vibrateSuccess()
    navigate(Screens.TransactionSuccessScreen, {
      fromTokenId,
      toTokenId,
      fromAmount: xautAmount,
      toAmount: new BigNumber(toAmount).shiftedBy(-toToken.decimals).toString(),
      transactionHash: swapTxHash,
      networkId,
      type: 'goldSell' as const,
    })

    AppAnalytics.track(GoldEvents.gold_sell_submit_success, {
      amount: xautAmount,
      txHash: swapTxHash,
    })
  } catch (err) {
    if (err === CANCELLED_PIN_INPUT) {
      Logger.info(TAG, 'Gold sell cancelled by user')
      yield* put(sellGoldError('Cancelled'))
      return
    }

    const error = ensureError(err)
    Logger.error(TAG, 'Error selling gold', error)
    vibrateError()
    yield* put(sellGoldError(error.message))

    AppAnalytics.track(GoldEvents.gold_sell_submit_error, {
      amount: xautAmount,
      error: error.message,
    })
  }
}

export function* goldSaga() {
  Logger.debug(TAG, 'Gold saga initialized')
  yield* takeLeading(fetchGoldPrice.type, safely(fetchGoldPriceSaga))
  yield* takeEvery(buyGoldStart.type, safely(buyGoldSaga))
  yield* takeEvery(sellGoldStart.type, safely(sellGoldSaga))
}

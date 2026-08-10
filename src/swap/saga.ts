import { PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { SwapEvents } from 'src/analytics/Events'
import { SwapTimeMetrics, SwapTxsReceiptProperties } from 'src/analytics/Properties'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { CANCELLED_PIN_INPUT } from 'src/pincode/authentication'
import { vibrateError } from 'src/styles/hapticFeedback'
import { getSwapTxsAnalyticsProperties } from 'src/swap/getSwapTxsAnalyticsProperties'
import { swapCancel, swapError, swapStart, swapSuccess } from 'src/swap/slice'
import { Field, SwapInfo, UNISWAP_V4_PROVIDER } from 'src/swap/types'
import { tokensByIdSelector } from 'src/tokens/selectors'
import { TokenBalance, TokenBalances } from 'src/tokens/slice'
import { getSupportedNetworkIdsForSwap } from 'src/tokens/utils'
import { BaseStandbyTransaction } from 'src/transactions/slice'
import {
  NetworkId,
  TokenTransactionTypeV2,
  TrackedTx,
  newTransactionContext,
} from 'src/transactions/types'
import {
  getPrefixedTxAnalyticsProperties,
  getTxReceiptAnalyticsProperties,
} from 'src/transactions/utils'
import { classifyError } from 'src/lib/errors'
import { simulateSwapTransaction } from 'src/lib/preflight'
import {
  inFlightAbort,
  inFlightAdvance,
  inFlightFail,
  inFlightStart,
} from 'src/lib/useTransactionInFlight/actions'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'
import { safely } from 'src/utils/safely'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { publicClient } from 'src/viem'
import { getPreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import { getViemWallet } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { getNetworkFromNetworkId } from 'src/web3/utils'
import { call, put, select, takeEvery } from 'typed-redux-saga'
import { Address, decodeFunctionData, erc20Abi } from 'viem'

const TAG = 'swap/saga'

function calculateEstimatedUsdValue({
  tokenInfo,
  tokenAmount,
}: {
  tokenInfo: TokenBalance
  tokenAmount: string
}): number | undefined {
  if (!tokenInfo.priceUsd) {
    return undefined
  }

  return new BigNumber(tokenAmount).times(tokenInfo.priceUsd).toNumber()
}

function getSwapTxsReceiptAnalyticsProperties(
  trackedTxs: TrackedTx[],
  networkId: NetworkId,
  tokensById: TokenBalances
): SwapTxsReceiptProperties {
  const txs = trackedTxs.map((trackedTx) =>
    getTxReceiptAnalyticsProperties(trackedTx, networkId, tokensById)
  )

  const approveTx = trackedTxs.length > 1 ? txs[0] : undefined
  const swapTx = trackedTxs.length > 0 ? txs[txs.length - 1] : undefined

  return {
    ...getPrefixedTxAnalyticsProperties(approveTx || {}, 'approve'),
    ...getPrefixedTxAnalyticsProperties(swapTx || {}, 'swap'),
    gasUsed: swapTx?.txGasUsed ? txs.reduce((sum, tx) => sum + (tx.txGasUsed || 0), 0) : undefined,
    gasFee: swapTx?.txGasFee ? txs.reduce((sum, tx) => sum + (tx.txGasFee || 0), 0) : undefined,
    gasFeeUsd: swapTx?.txGasFeeUsd
      ? txs.reduce((sum, tx) => sum + (tx.txGasFeeUsd || 0), 0)
      : undefined,
  }
}

export function* swapSubmitSaga(action: PayloadAction<SwapInfo>) {
  // Uniswap V4 payloads are handled by uniswapV4SwapSaga; the sentinel
  // `data: "0x"` in preparedTransactions would revert if this generic
  // Squid-shaped path tried to submit it.
  if (action.payload.quote.provider === UNISWAP_V4_PROVIDER) {
    return
  }
  const swapSubmittedAt = Date.now()
  const { swapId, userInput, quote, areSwapTokensShuffled, suppressSuccessNavigation } =
    action.payload
  const { fromTokenId, toTokenId, updatedField, swapAmount } = userInput
  const {
    provider,
    price,
    appFeePercentageIncludedInPrice,
    allowanceTarget,
    estimatedPriceImpact,
    preparedTransactions: serializablePreparedTransactions,
    receivedAt: quoteReceivedAt,
    swapType,
  } = quote
  const amountType = updatedField === Field.TO ? ('buyAmount' as const) : ('sellAmount' as const)
  const amount = swapAmount[updatedField]
  const preparedTransactions = getPreparedTransactions(serializablePreparedTransactions)

  const tokensById = yield* select((state) =>
    tokensByIdSelector(state, getSupportedNetworkIdsForSwap())
  )
  const fromToken = tokensById[fromTokenId]
  const toToken = tokensById[toTokenId]

  if (!fromToken || !toToken) {
    Logger.error(
      TAG,
      `Could not find to or from token for swap from ${fromTokenId} to ${toTokenId}`
    )
    yield* put(swapError(swapId))
    return
  }

  const flowId = `swap-${swapId}`
  yield* put(
    inFlightStart({
      flowId,
      flowKind: 'swap',
      steps: 1,
      currentStep: 0,
      status: 'preparing',
      preparedTransactions: serializablePreparedTransactions,
      networkId: fromToken.networkId,
      retryCount: 0,
      startedAt: swapSubmittedAt,
    })
  )

  const fromTokenBalance = fromToken.balance.shiftedBy(fromToken.decimals).toString()
  const estimatedSellTokenUsdValue = calculateEstimatedUsdValue({
    tokenInfo: fromToken,
    tokenAmount: swapAmount[Field.FROM],
  })
  const estimatedBuyTokenUsdValue = calculateEstimatedUsdValue({
    tokenInfo: toToken,
    tokenAmount: swapAmount[Field.TO],
  })

  const swapApproveContext = newTransactionContext(TAG, 'Swap/Approve')
  const swapExecuteContext = newTransactionContext(TAG, 'Swap/Execute')

  const defaultSwapExecuteProps = {
    toToken: toToken.address,
    toTokenId: toToken.tokenId,
    toTokenNetworkId: toToken.networkId,
    toTokenIsImported: !!toToken.isManuallyImported,
    fromToken: fromToken.address,
    fromTokenId: fromToken.tokenId,
    fromTokenNetworkId: fromToken.networkId,
    fromTokenIsImported: !!fromToken.isManuallyImported,
    amount,
    amountType,
    price,
    appFeePercentageIncludedInPrice,
    allowanceTarget,
    estimatedPriceImpact,
    provider,
    fromTokenBalance,
    swapExecuteTxId: swapExecuteContext.id,
    swapApproveTxId: swapApproveContext.id,
    estimatedSellTokenUsdValue,
    estimatedBuyTokenUsdValue,
    estimatedAppFeeUsdValue:
      (Number(appFeePercentageIncludedInPrice) / 100) * Number(estimatedSellTokenUsdValue),
    web3Library: 'viem' as const,
    areSwapTokensShuffled,
    ...getSwapTxsAnalyticsProperties(preparedTransactions, fromToken.networkId, tokensById),
    swapType,
  }

  let quoteToTransactionElapsedTimeInMs: number | undefined

  const getTimeMetrics = (): SwapTimeMetrics => ({
    quoteToUserConfirmsSwapElapsedTimeInMs: swapSubmittedAt - quoteReceivedAt,
    quoteToTransactionElapsedTimeInMs,
  })

  const trackedTxs: TrackedTx[] = []
  const networkId = fromToken.networkId

  let submitted = false

  try {
    const network = getNetworkFromNetworkId(networkId)
    if (!network) {
      throw new Error('Unknown token network')
    }

    const wallet = yield* call(getViemWallet, networkConfig.viemChain[network])
    if (!wallet.account) {
      // this should never happen
      throw new Error('no account found in the wallet')
    }

    for (const tx of preparedTransactions) {
      trackedTxs.push({
        tx,
        txHash: undefined,
        txReceipt: undefined,
      })
    }

    // Execute transaction(s)
    Logger.debug(TAG, `Starting to swap execute for address: ${wallet.account.address}`)

    const beforeSwapExecutionTimestamp = Date.now()
    quoteToTransactionElapsedTimeInMs = beforeSwapExecutionTimestamp - quoteReceivedAt

    // Defence-in-depth: the swap screen gates confirm on a live quote with
    // non-empty preparedTransactions, but state can theoretically be stale
    // (screen kept open for hours, quote refetched to empty, etc). If we
    // ever enter with zero txs, fail early with a user-facing message
    // instead of exploding on the mismatch check in sendPreparedTransactions.
    if (preparedTransactions.length === 0) {
      const emptyError = new Error('preparedTransactions empty at swapStart')
      Logger.error(TAG, emptyError.message)
      yield* put(swapError(swapId))
      yield* put(inFlightFail({ flowId, errorClass: classifyError(emptyError) }))
      captureBusinessError(emptyError, {
        feature: 'swap',
        provider: 'squid',
        action: 'empty_prepared_txs',
        errorCode: 'empty_prepared_txs',
        extra: { swapType },
      })
      return
    }

    const createSwapStandbyTxHandlers: ((
      transactionHash: string,
      feeCurrencyId?: string
    ) => BaseStandbyTransaction | null)[] = []

    // If there are 2 transactions, the first should be an approval. verify and
    // add a standby transaction for it
    if (preparedTransactions.length > 1 && preparedTransactions[0].data) {
      const { functionName, args } = yield* call(decodeFunctionData, {
        abi: erc20Abi,
        data: preparedTransactions[0].data,
      })
      if (functionName === 'approve' && preparedTransactions[0].to === fromToken.address && args) {
        const approvedAmountInSmallestUnit = args[1] as bigint
        const approvedAmount = new BigNumber(approvedAmountInSmallestUnit.toString())
          .shiftedBy(-fromToken.decimals)
          .toString()

        const createApprovalStandbyTx = (
          transactionHash: string,
          feeCurrencyId?: string
        ): BaseStandbyTransaction => {
          return {
            context: swapApproveContext,
            networkId,
            type: TokenTransactionTypeV2.Approval,
            transactionHash,
            tokenId: fromToken.tokenId,
            approvedAmount,
            feeCurrencyId,
          }
        }
        createSwapStandbyTxHandlers.push(createApprovalStandbyTx)
      }
    }

    const createSwapStandbyTx = (
      transactionHash: string,
      feeCurrencyId?: string
    ): BaseStandbyTransaction => ({
      context: swapExecuteContext,
      networkId,
      type:
        swapType === 'same-chain'
          ? TokenTransactionTypeV2.SwapTransaction
          : TokenTransactionTypeV2.CrossChainSwapTransaction,
      inAmount: {
        value: swapAmount[Field.TO],
        tokenId: toToken.tokenId,
      },
      outAmount: {
        value: swapAmount[Field.FROM],
        tokenId: fromToken.tokenId,
      },
      transactionHash,
      feeCurrencyId,
    })
    createSwapStandbyTxHandlers.push(createSwapStandbyTx)

    // Pad handlers with null-returning entries so the array length always
    // matches preparedTransactions.length. Handles two edge cases without
    // blowing up on the mismatch check downstream:
    //   1) Squid returns a multi-hop route with intermediate txs between
    //      approve and swap (approve + hop + swap = 3 txs).
    //   2) The first tx of a 2-tx batch is NOT a standard approve (e.g.
    //      permit2 or a batched call) so the approve-handler push above
    //      is skipped, but there are still 2 on-chain txs to send.
    // The intermediate/unknown txs are still SUBMITTED, just not recorded
    // as user-facing standby entries. Splice before the swap handler at
    // the tail so the swap remains the last one.
    while (createSwapStandbyTxHandlers.length < preparedTransactions.length) {
      createSwapStandbyTxHandlers.splice(createSwapStandbyTxHandlers.length - 1, 0, () => null)
    }

    // Pre-flight simulation (Track B / WRI): when the swap requires a separate
    // approve + swap pair, simulate the swap call against the latest state. If
    // the swap would revert for non-allowance reasons (slippage, paused
    // router, etc), abort BEFORE emitting the approve so the user does not end
    // up with a dangling allowance. Guarded by a Statsig flag for safe rollout.
    const preflightOn = yield* call(
      getFeatureGate,
      StatsigFeatureGates.WRI_PREFLIGHT_SWAP_SIMULATION
    )
    if (preflightOn && preparedTransactions.length > 1) {
      const swapTx = preparedTransactions[preparedTransactions.length - 1]
      if (swapTx?.to && swapTx?.data !== undefined) {
        const approvedAmountForSim =
          preparedTransactions[0]?.data && preparedTransactions[0].to === fromToken.address
            ? (() => {
                try {
                  const decoded = decodeFunctionData({
                    abi: erc20Abi,
                    data: preparedTransactions[0].data!,
                  })
                  if (decoded.functionName === 'approve' && decoded.args) {
                    return decoded.args[1] as bigint
                  }
                } catch {
                  // fall through
                }
                return BigInt(0)
              })()
            : BigInt(0)

        const sim = yield* call(simulateSwapTransaction, publicClient[network], {
          from: wallet.account.address as Address,
          to: swapTx.to as Address,
          data: (swapTx.data ?? '0x') as `0x${string}`,
          value: BigInt(swapTx.value ?? 0),
          assumedAllowance: approvedAmountForSim,
          sellToken: fromToken.address as Address,
        })
        if (sim.kind === 'revert') {
          Logger.warn(TAG, `Pre-flight swap simulation reverted: ${sim.reason}`)
          yield* put(swapError(swapId))
          yield* put(
            inFlightFail({
              flowId,
              errorClass: classifyError(new Error(`Pre-flight reverted: ${sim.reason}`)),
            })
          )
          return
        }
      }
    }

    const txHashes = yield* call(
      sendPreparedTransactions,
      serializablePreparedTransactions,
      networkId,
      createSwapStandbyTxHandlers
    )
    txHashes.forEach((txHash, i) => {
      trackedTxs[i].txHash = txHash
    })

    Logger.debug(TAG, 'Successfully sent swap transaction(s) to the network', txHashes)

    submitted = true

    // wait for the tx receipts, so that we can track them
    for (let i = 0; i < txHashes.length; i++) {
      const txReceipt = yield* call([publicClient[network], 'waitForTransactionReceipt'], {
        hash: txHashes[i],
      })
      Logger.debug(`Got transaction receipt ${i + 1} of ${trackedTxs.length}`, txReceipt)
      trackedTxs[i].txReceipt = txReceipt
    }

    const swapTxReceipt = trackedTxs[trackedTxs.length - 1].txReceipt
    if (swapTxReceipt?.status !== 'success') {
      throw new Error(`Swap transaction reverted: ${swapTxReceipt?.transactionHash}`)
    }

    yield* put(
      swapSuccess({
        swapId,
        fromTokenId,
        toTokenId,
        transactionHash: swapTxReceipt.transactionHash,
        networkId,
      })
    )
    yield* put(inFlightAdvance({ flowId, toStatus: 'succeeded' }))

    // Navigate to success screen unless the parent multi-swap flow told us
    // not to (see SwapInfo.suppressSuccessNavigation). The orchestrator will
    // navigate once at the end with the aggregated leg breakdown so the user
    // does not see the sheet flash for each step.
    if (!suppressSuccessNavigation) {
      navigate(Screens.TransactionSuccessScreen, {
        fromTokenId,
        toTokenId,
        fromAmount: swapAmount[Field.FROM],
        toAmount: swapAmount[Field.TO],
        transactionHash: swapTxReceipt.transactionHash,
        networkId,
        type: 'swap' as const,
      })
    }

    // Success is tracked only for same-chain swaps. Cross-chain swap success is tracked in the query helper
    // because for the cross-chain swaps, we have to wait for the transaction to be included in the
    // destination chain before we can consider the swap successful
    if (swapType === 'same-chain') {
      AppAnalytics.track(SwapEvents.swap_execute_success, {
        ...defaultSwapExecuteProps,
        ...getTimeMetrics(),
        ...getSwapTxsReceiptAnalyticsProperties(trackedTxs, networkId, tokensById),
        swapType,
      })
    }
  } catch (err) {
    if (err === CANCELLED_PIN_INPUT) {
      Logger.info(TAG, 'Swap cancelled by user')
      yield* put(swapCancel(swapId))
      yield* put(inFlightAbort({ flowId }))
      return
    }
    const error = ensureError(err)
    // dispatch the error early, in case the rest of the handling throws
    // and leaves the app in a bad state
    yield* put(swapError(swapId))
    yield* put(inFlightFail({ flowId, errorClass: classifyError(error) }))
    // Only vibrate if we haven't already submitted the transaction
    // since the user may be doing something else on the app by now
    // (different screen or a new swap)
    if (!submitted) {
      vibrateError()
    }

    Logger.error(TAG, 'Error while swapping', error)
    AppAnalytics.track(SwapEvents.swap_execute_error, {
      ...defaultSwapExecuteProps,
      ...getTimeMetrics(),
      ...getSwapTxsReceiptAnalyticsProperties(trackedTxs, networkId, tokensById),
      error: error.message,
    })
    captureBusinessError(error, {
      feature: 'swap',
      provider: 'squid',
      action: 'execute',
      errorCode: classifyError(error).kind,
      extra: { swapType, submitted },
    })
  }
}

export function* swapSaga() {
  yield* takeEvery(swapStart.type, safely(swapSubmitSaga))
}

import { createAction, PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { call, delay, put, race, select, take, takeEvery } from 'typed-redux-saga'
import { executeDollarsSpend7702Saga } from 'src/dollarsSpend/saga7702'
import {
  multiSwapCompleted,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
  multiSwapTransitionComplete,
} from 'src/dollarsSpend/slice'
import { SpendStep } from 'src/dollarsSpend/types'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { swapStart, swapSuccess, swapError } from 'src/swap/slice'
import { Field, SwapInfo } from 'src/swap/types'
import { fetchSwapQuoteForExecution } from 'src/swap/useSwapQuote'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import { getSupportedNetworkIdsForSwap } from 'src/tokens/utils'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { walletAddressSelector } from 'src/web3/selectors'

const TAG = 'dollarsSpend/saga'

export interface ExecuteMultiSwapPayload {
  steps: SpendStep[]
  toTokenId: string
}

export const executeMultiSwap = createAction<ExecuteMultiSwapPayload>(
  'dollarsSpend/executeMultiSwap'
)

function newSwapId(index: number) {
  return `multi-${Date.now()}-${index}-${Math.floor(Math.random() * 1e6)}`
}

export function* executeMultiSwapSaga(action: PayloadAction<ExecuteMultiSwapPayload>) {
  const { steps, toTokenId } = action.payload

  if (steps.length === 0) {
    return
  }

  // Track C: when the EIP-7702 / CIP-64 single-tx path is enabled, hand off to
  // the new saga. The legacy sequential loop below is the fallback whenever
  // the flag is off, the BatchExecutor isn't deployed yet, or the new path
  // throws (the new saga handles its own error dispatch).
  const sevenSevenZeroTwoOn = yield* call(
    getFeatureGate,
    StatsigFeatureGates.WRI_DOLLARS_SPEND_7702_V1
  )
  if (sevenSevenZeroTwoOn) {
    yield* call(executeDollarsSpend7702Saga, action)
    return
  }

  yield* put(multiSwapStarted({ steps }))

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    const swapId = newSwapId(index)

    const walletAddress = yield* select(walletAddressSelector)
    if (!walletAddress) {
      yield* put(
        multiSwapStepFailed({
          index,
          errorMessage: 'Wallet address unavailable for step execution',
        })
      )
      // Give the UI one frame to render the transitional message before
      // committing to PartialSuccessSheet. Bridges the render gap.
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }

    const tokensById = yield* select(tokensByIdSelector, getSupportedNetworkIdsForSwap())
    const fromToken = tokensById[step.tokenId]
    if (!fromToken) {
      yield* put(
        multiSwapStepFailed({
          index,
          errorMessage: `Token not found in wallet state: ${step.symbol}`,
        })
      )
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }

    const feeCurrencies = yield* select(feeCurrenciesSelector, fromToken.networkId as NetworkId)

    let freshQuote: Awaited<ReturnType<typeof fetchSwapQuoteForExecution>>
    try {
      // getSwapQuote expects smallest-unit (wei). Step carries whole units;
      // shift by decimals to match the regular swap path. ROUND_DOWN keeps
      // the requested amount within the user's balance.
      const amountInWei = step.amountTokenWhole
        .shiftedBy(step.decimals)
        .toFixed(0, BigNumber.ROUND_DOWN)
      freshQuote = yield* call(fetchSwapQuoteForExecution, {
        fromTokenId: step.tokenId,
        toTokenId,
        amount: amountInWei,
        walletAddress,
        fromToken,
        feeCurrencies,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Logger.warn(TAG, `Quote refetch failed for step ${index} (${step.symbol}): ${message}`)
      yield* put(multiSwapStepFailed({ index, errorMessage: message }))
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }

    const serializablePreparedTransactions =
      freshQuote.preparedTransactions.type === 'possible'
        ? getSerializablePreparedTransactions(freshQuote.preparedTransactions.transactions)
        : []

    const swapInfo: SwapInfo = {
      swapId,
      userInput: {
        fromTokenId: step.tokenId,
        toTokenId,
        swapAmount: {
          [Field.FROM]: step.amountTokenWhole.toString(),
          [Field.TO]: freshQuote.swapAmount.TO.toString(),
        },
        updatedField: Field.FROM,
      },
      quote: {
        preparedTransactions: serializablePreparedTransactions,
        receivedAt: freshQuote.receivedAt,
        price: freshQuote.price,
        appFeePercentageIncludedInPrice: freshQuote.appFeePercentageIncludedInPrice,
        provider: freshQuote.provider,
        estimatedPriceImpact: freshQuote.estimatedPriceImpact,
        allowanceTarget: freshQuote.allowanceTarget,
        swapType: freshQuote.swapType,
      },
      areSwapTokensShuffled: false,
    }

    yield* put(swapStart(swapInfo))

    // swapSuccess payload is SwapResult { swapId, ... }
    // swapError payload is a raw swapId string
    const { success, error } = yield* race({
      success: take((a: any) => a.type === swapSuccess.type && a.payload?.swapId === swapId),
      error: take((a: any) => a.type === swapError.type && a.payload === swapId),
    })

    if (success) {
      yield* put(multiSwapStepSucceeded({ index }))
    } else if (error) {
      Logger.warn(TAG, `Swap failed at step ${index} (${step.symbol})`)
      yield* put(
        multiSwapStepFailed({
          index,
          errorMessage: `Swap failed at step ${index} (${step.symbol})`,
        })
      )
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }
  }

  yield* put(multiSwapCompleted())
}

export function* dollarsSpendSaga() {
  yield* takeEvery(executeMultiSwap.type, executeMultiSwapSaga)
}

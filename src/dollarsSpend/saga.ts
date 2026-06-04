import { createAction, PayloadAction } from '@reduxjs/toolkit'
import { call, put, race, select, take, takeEvery } from 'typed-redux-saga'
import {
  multiSwapCompleted,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
} from 'src/dollarsSpend/slice'
import { SpendStep } from 'src/dollarsSpend/types'
import { swapStart, swapSuccess, swapError } from 'src/swap/slice'
import { Field, SwapInfo } from 'src/swap/types'
import { FetchSwapQuoteArgs, fetchSwapQuote } from 'src/swap/useSwapQuote'
import Logger from 'src/utils/Logger'
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

  yield* put(multiSwapStarted({ steps }))

  const walletAddress = (yield* select(walletAddressSelector)) ?? ''

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    const swapId = newSwapId(index)

    const fetchArgs: FetchSwapQuoteArgs = {
      fromTokenId: step.tokenId,
      toTokenId,
      amount: step.amountTokenWhole.toString(),
      walletAddress,
    }

    let freshQuote: Awaited<ReturnType<typeof fetchSwapQuote>>
    try {
      freshQuote = yield* call(fetchSwapQuote, fetchArgs)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Logger.warn(TAG, `Quote refetch failed for step ${index} (${step.symbol}): ${message}`)
      yield* put(multiSwapStepFailed({ index, errorMessage: message }))
      return
    }

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
        // preparedTransactions are empty here - this saga only orchestrates at
        // the price-discovery level. The actual tx preparation is handled by
        // the swap screen before the user confirms; this saga fires after that.
        preparedTransactions: [],
        receivedAt: Date.now(),
        price: freshQuote.price,
        appFeePercentageIncludedInPrice: undefined,
        provider: freshQuote.provider,
        estimatedPriceImpact: freshQuote.estimatedPriceImpact,
        allowanceTarget: '',
        swapType: 'same-chain',
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
      return
    }
  }

  yield* put(multiSwapCompleted())
}

export function* dollarsSpendSaga() {
  yield* takeEvery(executeMultiSwap.type, executeMultiSwapSaga)
}

import { PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { call, delay, put, select } from 'typed-redux-saga'
import { Address, encodeFunctionData, Hex } from 'viem'
import { BATCH_EXECUTOR_ABI } from 'src/dollarsSpend/batchExecutorAbi'
import { ExecuteMultiSwapPayload } from 'src/dollarsSpend/saga'
import {
  multiSwapCompleted,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
  multiSwapTransitionComplete,
} from 'src/dollarsSpend/slice'
import { fetchSwapQuoteForExecution } from 'src/swap/useSwapQuote'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import { getSupportedNetworkIdsForSwap } from 'src/tokens/utils'
import { Network, NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { getViemWallet } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { getConnectedUnlockedAccount } from 'src/web3/saga'
import { walletAddressSelector } from 'src/web3/selectors'

const TAG = 'dollarsSpend/saga7702'

interface InnerCall {
  target: Address
  value: bigint
  data: Hex
}

/**
 * EIP-7702 + CIP-64 saga path for dollarsSpend.
 *
 * Behind StatsigFeatureGates.WRI_DOLLARS_SPEND_7702_V1. When enabled, the
 * full multi-step plan is collapsed into ONE transaction:
 *   1. Sign an EIP-7702 authorization delegating the EOA to the BatchExecutor.
 *   2. Build inner Call[] for each step (approve + swap) using fresh quotes.
 *   3. Submit a single tx type 0x7b (CIP-64) carrying the auth list + the
 *      `to = walletAddress, data = BatchExecutor.execute(calls)` payload, with
 *      feeCurrency set to the first ERC-20 the user is spending so gas is
 *      paid in USDm/USDC/USAT/USDT rather than CELO.
 *
 * Confirmed live on Celo mainnet in the S1 spike. See
 * contracts-spike/scripts/s1-submit-7702-with-feecurrency.mjs.
 *
 * On any failure (auth, quote, submit) we dispatch multiSwapStepFailed at
 * index 0 because the entire batch is atomic — there is no partial success
 * for the user to recover from in this path.
 */
export function* executeDollarsSpend7702Saga(action: PayloadAction<ExecuteMultiSwapPayload>) {
  const { steps, toTokenId } = action.payload

  if (steps.length === 0) {
    return
  }

  yield* put(multiSwapStarted({ steps }))

  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    yield* put(
      multiSwapStepFailed({ index: 0, errorMessage: 'Wallet address unavailable for 7702 batch' })
    )
    yield* delay(50)
    yield* put(multiSwapTransitionComplete())
    return
  }

  const tokensById = yield* select(tokensByIdSelector, getSupportedNetworkIdsForSwap())

  // Build inner Call[] from fresh quotes for each step. Each step's prepared
  // transactions are (optional approve) + swap; we forward both, preserving
  // order so the BatchExecutor runs the allowance bump before the swap call.
  const innerCalls: InnerCall[] = []
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    const fromToken = tokensById[step.tokenId]
    if (!fromToken) {
      yield* put(
        multiSwapStepFailed({
          index: 0,
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
      yield* put(multiSwapStepFailed({ index: 0, errorMessage: message }))
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }

    if (freshQuote.preparedTransactions.type !== 'possible') {
      yield* put(
        multiSwapStepFailed({
          index: 0,
          errorMessage: `Prepared transactions not possible for step ${index} (${step.symbol})`,
        })
      )
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }

    for (const tx of freshQuote.preparedTransactions.transactions) {
      if (!tx.to || tx.data === undefined) {
        yield* put(
          multiSwapStepFailed({
            index: 0,
            errorMessage: `Malformed prepared transaction for step ${index} (${step.symbol})`,
          })
        )
        yield* delay(50)
        yield* put(multiSwapTransitionComplete())
        return
      }
      innerCalls.push({
        target: tx.to as Address,
        value: tx.value ?? BigInt(0),
        data: tx.data as Hex,
      })
    }
  }

  if (innerCalls.length === 0) {
    yield* put(multiSwapStepFailed({ index: 0, errorMessage: 'No inner calls to execute' }))
    yield* delay(50)
    yield* put(multiSwapTransitionComplete())
    return
  }

  try {
    const wallet = yield* call(getViemWallet, networkConfig.viemChain[Network.Celo])
    const account = wallet.account
    if (!account) {
      throw new Error('Wallet has no account loaded')
    }

    // Unlock the keychain account before signing. Without this, the
    // PrivateKeyAccount that backs the keychain LocalAccount is null and
    // `signAuthorization` (delegated through getUnlockedAccount in
    // src/viem/keychainAccountToAccount.ts) throws
    // "authentication needed: password or unlock". The legacy path goes
    // through sendPreparedTransactions which calls this internally; this
    // 7702 path signs directly via signAuthorization so it must unlock here.
    yield* call(getConnectedUnlockedAccount)

    // Sign EIP-7702 authorization delegating THIS EOA -> BatchExecutor.
    // executor: 'self' so viem uses the wallet's nonce sequence. Wrap in a
    // thunk because typed-redux-saga's `call([obj, method], args)` overload
    // requires a positional signature, but viem's signAuthorization takes a
    // single named-args object — easier to call directly.
    const authorization = yield* call(() =>
      wallet.signAuthorization({
        account,
        contractAddress: networkConfig.batchExecutorAddressCelo,
        executor: 'self',
      })
    )

    const calldata = encodeFunctionData({
      abi: BATCH_EXECUTOR_ABI,
      functionName: 'execute',
      args: [innerCalls],
    })

    // Pick the user-facing token from the first step as fee currency. The user
    // already has balance there (it's what they are spending); paying gas in
    // it keeps the flow CELO-free. The step.tokenId is `celo-mainnet:0x...`,
    // strip the prefix to get the bare ERC-20 address.
    const feeCurrencyAddress = steps[0].tokenId.split(':')[1] as Hex

    // sendTransaction args are typed via SendTransactionParameters which
    // expects `chain` when not hoisted on the client. Cast through unknown
    // because we additionally pass `authorizationList` + CIP-64 `feeCurrency`
    // which viem permits at runtime but its generic type narrowing trips on
    // when mixing 7702 with CIP-64 in one call.
    const sendArgs = {
      account,
      to: walletAddress as Address,
      data: calldata,
      authorizationList: [authorization],
      feeCurrency: feeCurrencyAddress,
    } as unknown as Parameters<typeof wallet.sendTransaction>[0]

    const hash = yield* call(() => wallet.sendTransaction(sendArgs))

    Logger.info(TAG, `Submitted 7702 dollarsSpend batch: ${hash}`)

    // Mark each step as succeeded optimistically — the batch is atomic, so
    // once submitted the user-facing progress reaches 100%. A production
    // follow-up polls the receipt and dispatches multiSwapStepFailed if the
    // tx reverts. For this scaffold we stay simple.
    for (let i = 0; i < steps.length; i++) {
      yield* put(multiSwapStepSucceeded({ index: i }))
    }
    yield* put(multiSwapCompleted())
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    Logger.warn(TAG, `7702 batch failed: ${message}`)
    yield* put(multiSwapStepFailed({ index: 0, errorMessage: message }))
    yield* delay(50)
    yield* put(multiSwapTransitionComplete())
  }
}

import { PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import * as Sentry from '@sentry/react-native'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { SwapEvents } from 'src/analytics/Events'
import { SwapTimeMetrics, SwapTxsReceiptProperties } from 'src/analytics/Properties'
import { SENTRY_ENABLED } from 'src/config'
import { classifyError } from 'src/lib/errors'
import {
  inFlightAbort,
  inFlightAdvance,
  inFlightFail,
  inFlightStart,
} from 'src/lib/useTransactionInFlight/actions'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { CANCELLED_PIN_INPUT } from 'src/pincode/authentication'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { vibrateError } from 'src/styles/hapticFeedback'
import { getSwapTxsAnalyticsProperties } from 'src/swap/getSwapTxsAnalyticsProperties'
import { swapCancel, swapError, swapStart, swapSuccess } from 'src/swap/slice'
import {
  Field,
  SwapInfo,
  UNISWAP_V4_PROVIDER,
  UniswapV4BuildTxRequest,
  UniswapV4BuildTxResponse,
} from 'src/swap/types'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import { reorderForBugE } from 'src/tokens/feeCurrencyPicker'
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
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import { safely } from 'src/utils/safely'
import { publicClient } from 'src/viem'
import { prepareTransactions, PreparedTransactionsResult } from 'src/viem/prepareTransactions'
import {
  getPreparedTransactions,
  getSerializablePreparedTransactions,
} from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import { getViemWallet } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { getConnectedUnlockedAccount } from 'src/web3/saga'
import { getNetworkFromNetworkId } from 'src/web3/utils'
import { call, put, select, takeEvery } from 'typed-redux-saga'
import { Address, Hex, TypedDataDefinition } from 'viem'

const TAG = 'swap/uniswapV4Saga'

/**
 * Resolve the (possibly relative) buildTxUrl backend returns in the
 * quote response against the TuCop backend base. Backend today ships
 * `/api/swap/build-tx`; the wallet MUST accept absolute URLs too in
 * case backend ever needs to shard the executor to a distinct host.
 */
function resolveBuildTxUrl(buildTxUrl: string): string {
  if (buildTxUrl.startsWith('http://') || buildTxUrl.startsWith('https://')) {
    return buildTxUrl
  }
  const base = networkConfig.tucopBackendBaseUrl.replace(/\/+$/, '')
  const path = buildTxUrl.startsWith('/') ? buildTxUrl : `/${buildTxUrl}`
  return `${base}${path}`
}

/**
 * POST the signed permit + build-tx request. Backend rebuilds calldata
 * server-side and returns {to, data, value}. Failures are surfaced to
 * the caller as ordinary Errors — the saga upstairs converts them to a
 * generic user-facing message (no tech leak) + a Sentry breadcrumb.
 */
export async function postBuildTx(
  buildTxUrl: string,
  body: UniswapV4BuildTxRequest & { permit2Signature: Hex }
): Promise<UniswapV4BuildTxResponse> {
  const url = resolveBuildTxUrl(buildTxUrl)
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`build-tx ${response.status}: ${text || response.statusText}`)
  }

  const result = (await response.json()) as UniswapV4BuildTxResponse
  if (!result.to || !result.data) {
    throw new Error(`build-tx returned malformed body: ${JSON.stringify(result)}`)
  }
  return result
}

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

export function isUniswapV4SwapInfo(swapInfo: SwapInfo): boolean {
  return swapInfo.quote.provider === UNISWAP_V4_PROVIDER && !!swapInfo.quote.permit2
}

/**
 * Execution path for the Uniswap V4 Permit2 fallback (spec section 12).
 * Steps:
 *   1. Detect uniswap-v4 (done by caller — swapSubmitSaga forks here).
 *   2. Send the approve tx (if any) via the shared sendPreparedTransactions.
 *   3. Skip-signing check: always sign for safety (spec's recommended default).
 *   4. sign the Permit2 typed data via the viem wallet.
 *   5. POST /api/swap/build-tx with the signature; backend returns
 *      {to, data, value} for the real swap tx.
 *   6. Prepare + submit the follower tx via sendPreparedTransactions.
 */
export function* uniswapV4SwapSubmitSaga(action: PayloadAction<SwapInfo>) {
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
    permit2,
  } = quote

  const amountType = updatedField === Field.TO ? ('buyAmount' as const) : ('sellAmount' as const)
  const amount = swapAmount[updatedField]

  const tokensById = yield* select((state) =>
    tokensByIdSelector(state, getSupportedNetworkIdsForSwap())
  )
  const fromToken = tokensById[fromTokenId]
  const toToken = tokensById[toTokenId]

  if (!fromToken || !toToken) {
    Logger.error(TAG, `Missing token metadata for swap ${fromTokenId} -> ${toTokenId}`)
    yield* put(swapError(swapId))
    return
  }

  if (!permit2) {
    // Guarded by caller (isUniswapV4SwapInfo) but re-check keeps types
    // narrow inside the saga body.
    Logger.error(TAG, `uniswap-v4 provider without permit2 metadata for ${swapId}`)
    yield* put(swapError(swapId))
    return
  }

  const preparedTransactions = getPreparedTransactions(serializablePreparedTransactions)
  const approveTxs = preparedTransactions

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
      throw new Error('no account found in the wallet')
    }
    const userAddress = wallet.account.address

    // Phase A: submit approve (if any). Reuse the standby handler
    // machinery so the tx card renders exactly like a Squid approve.
    if (approveTxs.length > 0) {
      const createApprovalStandbyTx = (
        transactionHash: string,
        feeCurrencyId?: string
      ): BaseStandbyTransaction => ({
        context: swapApproveContext,
        networkId,
        type: TokenTransactionTypeV2.Approval,
        transactionHash,
        tokenId: fromToken.tokenId,
        approvedAmount: swapAmount[Field.FROM],
        feeCurrencyId,
      })

      const approveHashes = yield* call(
        sendPreparedTransactions,
        serializablePreparedTransactions,
        networkId,
        [createApprovalStandbyTx]
      )
      for (const hash of approveHashes) {
        trackedTxs.push({ tx: preparedTransactions[0], txHash: hash, txReceipt: undefined })
        const receipt = yield* call([publicClient[network], 'waitForTransactionReceipt'], {
          hash,
        })
        trackedTxs[trackedTxs.length - 1].txReceipt = receipt
        if (receipt.status !== 'success') {
          throw new Error(`approve reverted: ${receipt.transactionHash}`)
        }
      }
    }

    // Phase B: sign Permit2, POST /build-tx, submit follower.

    // Step 4: sign the Permit2 typed data. Call signTypedData on the
    // LocalAccount directly (not the wallet-client action) — the account
    // is our keychainAccountToAccount, which forwards to the unlocked
    // PrivateKeyAccount and produces the compact 0x + 130 hex signature
    // the backend expects.
    //
    // Re-unlock the keychain before signing. `sendPreparedTransactions` in
    // Phase A held the pin cache with `pinTransactional` but releases it in
    // its `finally` block, so by the time we get here the cache may have
    // expired (waitForTransactionReceipt above can burn many seconds). Call
    // `getConnectedUnlockedAccount` to re-prompt/reuse the PIN as needed;
    // otherwise `account.signTypedData` throws "authentication needed:
    // password or unlock" and the whole flow errors after the on-chain
    // approve already spent gas.
    yield* call(getConnectedUnlockedAccount)
    const account = wallet.account
    const permit2Signature: Hex = yield* call(() =>
      account.signTypedData!(permit2.typedData as unknown as TypedDataDefinition)
    )

    // Step 5: POST /api/swap/build-tx. Backend rebuilds calldata and
    // returns {to, data, value}. Retries + timeouts handled by
    // fetchWithTimeout; 4xx propagates as an Error to the catch below.
    const buildResult = yield* call(postBuildTx, permit2.buildTxUrl, {
      ...permit2.buildTxRequest,
      permit2Signature,
    })

    // Step 6: prepare + submit the follower tx.
    const rawFeeCurrencies = yield* select((state) => feeCurrenciesSelector(state, networkId))
    const feeCurrencies = reorderForBugE(rawFeeCurrencies)

    const swapTxPrepared: PreparedTransactionsResult = yield* call(() =>
      prepareTransactions({
        feeCurrencies,
        spendToken: fromToken,
        spendTokenAmount: new BigNumber(swapAmount[Field.FROM]).shiftedBy(fromToken.decimals),
        baseTransactions: [
          {
            from: userAddress,
            to: buildResult.to as Address,
            data: buildResult.data as Hex,
            value: BigInt(buildResult.value || '0'),
          },
        ],
        throwOnSpendTokenAmountExceedsBalance: false,
        origin: 'swap',
      })
    )

    if (swapTxPrepared.type !== 'possible') {
      throw new Error(`follower tx not preparable: ${swapTxPrepared.type}`)
    }

    const followerSerializable = getSerializablePreparedTransactions(swapTxPrepared.transactions)

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

    const beforeSwapExecutionTimestamp = Date.now()
    quoteToTransactionElapsedTimeInMs = beforeSwapExecutionTimestamp - quoteReceivedAt

    const followerHashes = yield* call(sendPreparedTransactions, followerSerializable, networkId, [
      createSwapStandbyTx,
    ])
    submitted = true

    for (const hash of followerHashes) {
      trackedTxs.push({
        tx: swapTxPrepared.transactions[followerHashes.indexOf(hash)],
        txHash: hash,
        txReceipt: undefined,
      })
      const receipt = yield* call([publicClient[network], 'waitForTransactionReceipt'], { hash })
      trackedTxs[trackedTxs.length - 1].txReceipt = receipt
    }

    const swapTxReceipt = trackedTxs[trackedTxs.length - 1].txReceipt
    if (swapTxReceipt?.status !== 'success') {
      throw new Error(`swap tx reverted: ${swapTxReceipt?.transactionHash}`)
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

    if (swapType === 'same-chain') {
      AppAnalytics.track(SwapEvents.swap_execute_success, {
        ...defaultSwapExecuteProps,
        ...getTimeMetrics(),
        ...getSwapTxsReceiptAnalyticsProperties(trackedTxs, networkId, tokensById),
        ...getSwapTxsAnalyticsProperties(
          [...approveTxs, ...swapTxPrepared.transactions],
          networkId,
          tokensById
        ),
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
    yield* put(swapError(swapId))
    yield* put(inFlightFail({ flowId, errorClass: classifyError(error) }))
    if (!submitted) {
      vibrateError()
    }
    Logger.error(TAG, 'Error while swapping (uniswap-v4)', error)
    if (SENTRY_ENABLED) {
      Sentry.addBreadcrumb({
        category: 'swap',
        message: 'uniswap-v4 execution failed',
        level: 'error',
        data: { swapId, provider, submitted },
      })
    }
    AppAnalytics.track(SwapEvents.swap_execute_error, {
      ...defaultSwapExecuteProps,
      ...getTimeMetrics(),
      ...getSwapTxsReceiptAnalyticsProperties(trackedTxs, networkId, tokensById),
      error: error.message,
    })
    captureBusinessError(error, {
      feature: 'swap',
      provider: 'uniswap-v4',
      action: 'execute',
      errorCode: classifyError(error).kind,
      extra: { swapType, submitted },
    })
  }
}

export function* uniswapV4SwapSaga() {
  yield* takeEvery(swapStart.type, safely(uniswapV4SwapSubmitSagaIfMatch))
}

// Wrapper that only runs when the payload is a uniswap-v4 swap. Kept
// separate so the legacy swap saga (which handles Squid + everything
// else) can keep listening to the same swapStart action without
// double-executing on uniswap-v4 payloads.
function* uniswapV4SwapSubmitSagaIfMatch(action: PayloadAction<SwapInfo>) {
  if (!isUniswapV4SwapInfo(action.payload)) {
    return
  }
  yield* call(uniswapV4SwapSubmitSaga, action)
}

// Re-exports for the test suite.
export const __TESTING__ = {
  resolveBuildTxUrl,
  postBuildTx,
  isUniswapV4SwapInfo,
}

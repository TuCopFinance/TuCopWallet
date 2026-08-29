import { PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import { fetchGoldPriceWithFallback } from 'src/gold/api'
import { classifyError } from 'src/lib/errors'
import {
  inFlightAbort,
  inFlightAdvance,
  inFlightFail,
  inFlightStart,
} from 'src/lib/useTransactionInFlight/actions'
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
import {
  feeCurrenciesSelector,
  nativeFeeCurrencySelector,
  tokensByIdSelector,
} from 'src/tokens/selectors'
import { importToken } from 'src/tokens/slice'
import { computeReceiptNetworkFee } from 'src/swap/computeReceiptNetworkFee'
import { recordSwapFeeMetadata } from 'src/swap/slice'
import { fetchSwapQuoteForExecution } from 'src/swap/useSwapQuote'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { walletAddressSelector } from 'src/web3/selectors'
import { getSupportedNetworkIdsForSwap } from 'src/tokens/utils'
import { BaseStandbyTransaction } from 'src/transactions/slice'
import { NetworkId, TokenTransactionTypeV2, newTransactionContext } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { safely } from 'src/utils/safely'
import { publicClient } from 'src/viem'
import { extractRevertReason } from 'src/viem/extractRevertSelector'
import { getPreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import { getNetworkFromNetworkId } from 'src/web3/utils'
import { call, put, select, takeEvery, takeLeading } from 'typed-redux-saga'
import { Hash, decodeFunctionData, erc20Abi } from 'viem'
import type { NetworkId as _NID } from 'src/transactions/types'
import type { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'
import type { TokenBalance } from 'src/tokens/slice'
import type { BaseStandbyTransaction as _BST } from 'src/transactions/slice'

// Class of Forno / op-reth submit-time rejection that is safe to retry
// with a freshly-fetched quote. Trigger observed 2026-08-26 on gold sell
// during a Celo baseFee spike (200 gwei sustained): the pre-built Squid
// tx captured gas params at quote time, baseFee climbed a few seconds
// later, op-reth rejected the tx pre-mempool with "Missing or invalid
// parameters" (CIP-64 catch-all -32602 wording after the 2026-07-22 Celo
// L2 migration). Same pattern also applies to any transient RPC hiccup
// where a fresh quote would produce valid params. Match is deliberately
// permissive: any "Missing or invalid parameters" surfaced anywhere in
// the error chain qualifies. Non-retryable errors (revert, user reject,
// nonce collision, actual insufficient balance) do NOT match this regex
// and propagate on first attempt.
const REFETCH_RETRY_ERROR_REGEX = /Missing or invalid parameters/i

// Refetch a fresh Squid quote for gold buy/sell at submit time and retry
// sendPreparedTransactions if the first attempt is rejected by op-reth
// with the transient class above. Runs at most ONE refetch + retry so a
// persistent chain condition (paused router, real balance issue) surfaces
// promptly instead of looping. `firstAttempt` uses the pre-built txs the
// user saw on the confirmation screen; only if that first attempt hits
// the retryable class do we hit Squid again. Keeps the happy-path RPS on
// Squid at the pre-existing level.
function* submitGoldTxsWithOpRethRetry({
  serializablePreparedTransactions,
  networkId,
  createStandbyTxHandlers,
  fromTokenId,
  toTokenId,
  fromToken,
  amount,
}: {
  serializablePreparedTransactions: SerializableTransactionRequest[]
  networkId: _NID
  createStandbyTxHandlers: ((transactionHash: string, feeCurrencyId?: string) => _BST | null)[]
  fromTokenId: string
  toTokenId: string
  fromToken: TokenBalance
  amount: string
}) {
  try {
    return yield* call(
      sendPreparedTransactions,
      serializablePreparedTransactions,
      networkId,
      createStandbyTxHandlers
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!REFETCH_RETRY_ERROR_REGEX.test(message)) throw err

    Logger.warn(
      TAG,
      `Submit hit retryable op-reth class (${REFETCH_RETRY_ERROR_REGEX}); refetching fresh quote and retrying once: ${message}`
    )

    const walletAddress = yield* select(walletAddressSelector)
    if (!walletAddress) throw err
    const feeCurrencies = yield* select((s) => feeCurrenciesSelector(s, networkId))

    let freshQuote
    try {
      freshQuote = yield* call(fetchSwapQuoteForExecution, {
        fromTokenId,
        toTokenId,
        amount,
        walletAddress,
        fromToken,
        feeCurrencies,
      })
    } catch (refetchErr) {
      Logger.warn(TAG, `Refetch failed during op-reth retry; giving up: ${String(refetchErr)}`)
      throw err
    }
    if (freshQuote.preparedTransactions.type !== 'possible') throw err

    const freshTxs = getSerializablePreparedTransactions(
      freshQuote.preparedTransactions.transactions
    )
    return yield* call(sendPreparedTransactions, freshTxs, networkId, createStandbyTxHandlers)
  }
}

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
  const flowId = `gold-buy-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

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

  yield* put(
    inFlightStart({
      flowId,
      flowKind: 'gold',
      steps: 1,
      currentStep: 0,
      status: 'preparing',
      preparedTransactions: serializablePreparedTransactions,
      networkId,
      retryCount: 0,
      startedAt: Date.now(),
    })
  )

  const buyApproveContext = newTransactionContext(TAG, 'GoldBuy/Approve')
  const buyExecuteContext = newTransactionContext(TAG, 'GoldBuy/Execute')

  const preparedTransactions = getPreparedTransactions(serializablePreparedTransactions)

  // Defence-in-depth: the confirm screen should never dispatch buyGoldStart
  // with an empty preparedTransactions (the button is gated on this). If it
  // still happens (e.g. stale state, race with quote refetch), fail early
  // with a user-actionable message instead of hitting the mismatch check in
  // sendPreparedTransactions.
  if (preparedTransactions.length === 0) {
    const error = new Error('preparedTransactions empty at buyGoldStart')
    Logger.error(TAG, error.message)
    yield* put(buyGoldError('Estamos preparando tu compra, esperá un momento y probá de nuevo.'))
    yield* put(inFlightFail({ flowId, errorClass: classifyError(error) }))
    captureBusinessError(error, {
      feature: 'earn',
      provider: 'squid',
      action: 'buy_gold_empty_prepared_txs',
      errorCode: 'empty_prepared_txs',
      extra: { fromTokenId, fromAmount },
    })
    return
  }

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

    // Pad handlers with null-returning entries so the array length always
    // matches preparedTransactions.length even for multi-hop or non-approve
    // first-tx cases (see swap/saga.ts for the same rationale).
    while (createStandbyTxHandlers.length < preparedTransactions.length) {
      createStandbyTxHandlers.splice(createStandbyTxHandlers.length - 1, 0, () => null)
    }

    // Send transactions via the op-reth-transient retry helper: first
    // attempt reuses the confirmation-screen prebuilt txs; on the specific
    // transient class refetch a fresh Squid quote and retry once.
    const txHashes = yield* call(submitGoldTxsWithOpRethRetry, {
      serializablePreparedTransactions,
      networkId,
      createStandbyTxHandlers,
      fromTokenId,
      toTokenId: quote.toTokenId,
      fromToken,
      amount: new BigNumber(fromAmount).shiftedBy(fromToken.decimals).toFixed(0),
    })

    Logger.debug(TAG, 'Successfully sent gold buy transaction(s)', txHashes)

    // Wait for the swap transaction receipt
    const swapTxHash = txHashes[txHashes.length - 1]
    const txReceipt = yield* call([publicClient[network], 'waitForTransactionReceipt'], {
      hash: swapTxHash,
    })

    if (txReceipt.status !== 'success') {
      // Tag the error with the tx hash + block on the error itself so the
      // catch handler can extract them and pass to captureBusinessError as
      // explicit extras. The generic string form gets scrubbed to
      // prefix..suffix by piiScrub, which is OK for support lookup, but the
      // .goldRevertedTxHash / .goldRevertedBlock tags survive the scrub as
      // structured fields and let backend classify reverts without parsing
      // messages (TUCOPWALLET-14 root-cause requires cross-referencing the
      // reverted tx on-chain to know if it was slippage, liquidity, or a
      // stale approval).
      const revertError = new Error(`Gold buy transaction reverted: ${swapTxHash}`) as Error & {
        goldRevertedTxHash?: string
        goldRevertedBlock?: string
      }
      revertError.goldRevertedTxHash = swapTxHash
      revertError.goldRevertedBlock = txReceipt.blockNumber?.toString()
      throw revertError
    }

    yield* put(buyGoldSuccess({ txHash: swapTxHash }))
    yield* put(inFlightAdvance({ flowId, toStatus: 'succeeded' }))

    // Persist fee metadata so the TransactionSuccessScreen (goldBuy variant)
    // reads provider + network fee + integrator fee identically to the swap
    // variant. Without this dispatch the success screen's `provider` fallback
    // is undefined for non-swap types and the "Ruta del intercambio" reveal
    // never renders, and the fee bottom sheet only shows Tarifa de red
    // (missing the 0.5% Squid integrator row shown on regular swaps).
    // Multi-leg virtual-Dolares buys take saga7702 which already records
    // 'squid-7702' + integrator fee; this single-leg path uses the quote's
    // own provider slug and computes appFeeUsd from the quoted percentage.
    try {
      const nativeFeeCurrencyForSaga = yield* select((s) => nativeFeeCurrencySelector(s, networkId))
      const tokensByIdForSaga = yield* select((s) => tokensByIdSelector(s, [networkId]))
      const computedNetworkFee = yield* call(computeReceiptNetworkFee, {
        publicClient: publicClient[network],
        receipt: txReceipt,
        networkId,
        nativeFeeCurrency: nativeFeeCurrencyForSaga,
        tokensById: tokensByIdForSaga,
      })
      // appFeeUsd = (integrator percentage / 100) * sold-token USD value.
      // Matches src/swap/saga.ts (line ~425). Squid discounts this from the
      // delivered amount at quote time, but we surface it as its own line so
      // the user sees the platform take. Falls back to '0' when the quote
      // lacks the field (older backend) or when priceUsd for fromToken is
      // unknown (never for Pesos which is 1:1 with COP, but defensive).
      // fromAmount arrives in WHOLE units (e.g. "3500" for 3500 Pesos), NOT
      // wei — the GoldBuyEnterAmount navigate call uses
      // `parsedTokenAmount.toString()` before it hits this saga via the
      // action payload. Do NOT shiftedBy(-decimals) here; that would divide
      // by 10^18 and produce an appFeeUsd tiny by that factor, causing the
      // provider-fee row to render as "0.0000000000000000033 Pesos" on the
      // success + tx-details screens.
      const appFeePct = quote.appFeePercentageIncludedInPrice
        ? new BigNumber(quote.appFeePercentageIncludedInPrice)
        : new BigNumber(0)
      const fromAmountWhole = new BigNumber(fromAmount)
      const fromUsd = fromToken.priceUsd
        ? fromAmountWhole.multipliedBy(fromToken.priceUsd)
        : new BigNumber(0)
      const computedAppFeeUsd =
        appFeePct.gt(0) && fromUsd.gt(0)
          ? appFeePct.multipliedBy(fromUsd).dividedBy(100).toString()
          : '0'
      yield* put(
        recordSwapFeeMetadata({
          txHash: swapTxHash,
          appFeeUsd: computedAppFeeUsd,
          provider: quote.swapProvider ?? 'squid',
          networkFeeValue: computedNetworkFee?.value,
          networkFeeTokenId: computedNetworkFee?.tokenId,
        })
      )
    } catch (feeErr) {
      Logger.warn(TAG, 'Failed to record gold buy fee metadata', { error: feeErr })
    }

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
      yield* put(inFlightAbort({ flowId }))
      return
    }

    const error = ensureError(err)
    Logger.error(TAG, 'Error buying gold', error)
    vibrateError()
    yield* put(buyGoldError(error.message))
    yield* put(inFlightFail({ flowId, errorClass: classifyError(error) }))

    AppAnalytics.track(GoldEvents.gold_buy_submit_error, {
      amount: fromAmount,
      error: error.message,
    })
    // Extract on-chain revert tags added by the throw above; keep them as
    // structured extras so backend can look up the reverted tx by hash +
    // block without parsing message strings that go through piiScrub.
    const revertTx = (error as Error & { goldRevertedTxHash?: string }).goldRevertedTxHash
    const revertBlock = (error as Error & { goldRevertedBlock?: string }).goldRevertedBlock
    // When we have a reverted tx hash, replay it via eth_call at the same
    // block to recover the 4-byte custom-error selector (or a short revert
    // reason for plain revert strings). Ships to Sentry as structured
    // extras so backend can map the selector to a contract error name
    // (Squid, Uniswap, ERC20) without needing every ABI on the wallet.
    let revertSelector: string | undefined
    let revertReason: string | undefined
    if (revertTx) {
      const decoded = yield* call(extractRevertReason, revertTx as Hash)
      if (decoded) {
        revertSelector = decoded.selector
        revertReason = decoded.reason
      }
    }
    const errorCode = revertTx ? 'reverted_onchain' : classifyError(error).kind
    captureBusinessError(error, {
      feature: 'gold',
      provider: 'squid',
      action: 'buy_gold_execute',
      errorCode,
      extra: {
        fromAmount,
        fromTokenId,
        ...(revertTx ? { revertedTxHash: revertTx } : {}),
        ...(revertBlock ? { revertedBlock: revertBlock } : {}),
        ...(revertSelector ? { revertSelector } : {}),
        ...(revertReason ? { revertReason } : {}),
      },
    })
  }
}

/**
 * Execute gold sell transaction
 */
function* sellGoldSaga(action: PayloadAction<GoldSellInfo>) {
  const { toTokenId, xautAmount, quote } = action.payload
  const { preparedTransactions: serializablePreparedTransactions, toAmount, fromTokenId } = quote
  const flowId = `gold-sell-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

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

  yield* put(
    inFlightStart({
      flowId,
      flowKind: 'gold',
      steps: 1,
      currentStep: 0,
      status: 'preparing',
      preparedTransactions: serializablePreparedTransactions,
      networkId,
      retryCount: 0,
      startedAt: Date.now(),
    })
  )

  const sellApproveContext = newTransactionContext(TAG, 'GoldSell/Approve')
  const sellExecuteContext = newTransactionContext(TAG, 'GoldSell/Execute')

  const preparedTransactions = getPreparedTransactions(serializablePreparedTransactions)

  // Defence-in-depth: mirror of buyGoldSaga guard. See notes there.
  if (preparedTransactions.length === 0) {
    const error = new Error('preparedTransactions empty at sellGoldStart')
    Logger.error(TAG, error.message)
    yield* put(sellGoldError('Estamos preparando tu venta, esperá un momento y probá de nuevo.'))
    yield* put(inFlightFail({ flowId, errorClass: classifyError(error) }))
    captureBusinessError(error, {
      feature: 'earn',
      provider: 'squid',
      action: 'sell_gold_empty_prepared_txs',
      errorCode: 'empty_prepared_txs',
      extra: { toTokenId, xautAmount },
    })
    return
  }

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

    // Same padding rationale as buyGoldSaga above.
    while (createStandbyTxHandlers.length < preparedTransactions.length) {
      createStandbyTxHandlers.splice(createStandbyTxHandlers.length - 1, 0, () => null)
    }

    // Send transactions via the op-reth-transient retry helper (mirrors
    // buyGoldSaga above). fromToken here is XAUt0 (the sold token) so we
    // resolve it from the tokens registry before calling the helper.
    const xaut0FromToken = tokensById[fromTokenId]
    const txHashes = xaut0FromToken
      ? yield* call(submitGoldTxsWithOpRethRetry, {
          serializablePreparedTransactions,
          networkId,
          createStandbyTxHandlers,
          fromTokenId,
          toTokenId,
          fromToken: xaut0FromToken,
          amount: new BigNumber(xautAmount).shiftedBy(XAUT0_DECIMALS).toFixed(0),
        })
      : yield* call(
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
      // See buyGoldSaga above: attach revert tags so the catch handler can
      // surface them as structured Sentry extras (survives piiScrub as
      // first-class fields, not just parsed from a scrubbed message string).
      const revertError = new Error(`Gold sell transaction reverted: ${swapTxHash}`) as Error & {
        goldRevertedTxHash?: string
        goldRevertedBlock?: string
      }
      revertError.goldRevertedTxHash = swapTxHash
      revertError.goldRevertedBlock = txReceipt.blockNumber?.toString()
      throw revertError
    }

    yield* put(sellGoldSuccess({ txHash: swapTxHash }))
    yield* put(inFlightAdvance({ flowId, toStatus: 'succeeded' }))

    // Persist fee metadata for the TransactionSuccessScreen goldSell variant,
    // same shape as the buy path above so the success screen + tx-details
    // read identically to a regular swap: network fee + integrator fee split
    // into two rows in the info sheet, "Ruta del intercambio" reveal with
    // "Ejecutado por Squid". Single-leg XAUt0 -> Pesos always goes through
    // Squid (there is no Uniswap V4 pool for XAUt0 on Celo).
    try {
      const nativeFeeCurrencyForSaga = yield* select((s) => nativeFeeCurrencySelector(s, networkId))
      const tokensByIdForSaga = yield* select((s) => tokensByIdSelector(s, [networkId]))
      const computedNetworkFee = yield* call(computeReceiptNetworkFee, {
        publicClient: publicClient[network],
        receipt: txReceipt,
        networkId,
        nativeFeeCurrency: nativeFeeCurrencyForSaga,
        tokensById: tokensByIdForSaga,
      })
      // appFeeUsd = (integrator pct / 100) * sold-XAUt0 USD value. Symmetric
      // with the buy path. XAUt0 priceUsd comes from tokensById; sold amount
      // is xautAmount already in whole units (per GoldSellInfo shape).
      const fromXautToken = tokensByIdForSaga[fromTokenId]
      const appFeePct = quote.appFeePercentageIncludedInPrice
        ? new BigNumber(quote.appFeePercentageIncludedInPrice)
        : new BigNumber(0)
      const soldWhole = new BigNumber(xautAmount)
      const soldUsd = fromXautToken?.priceUsd
        ? soldWhole.multipliedBy(fromXautToken.priceUsd)
        : new BigNumber(0)
      const computedAppFeeUsd =
        appFeePct.gt(0) && soldUsd.gt(0)
          ? appFeePct.multipliedBy(soldUsd).dividedBy(100).toString()
          : '0'
      yield* put(
        recordSwapFeeMetadata({
          txHash: swapTxHash,
          appFeeUsd: computedAppFeeUsd,
          provider: quote.swapProvider ?? 'squid',
          networkFeeValue: computedNetworkFee?.value,
          networkFeeTokenId: computedNetworkFee?.tokenId,
        })
      )
    } catch (feeErr) {
      Logger.warn(TAG, 'Failed to record gold sell fee metadata', { error: feeErr })
    }

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
      yield* put(inFlightAbort({ flowId }))
      return
    }

    const error = ensureError(err)
    Logger.error(TAG, 'Error selling gold', error)
    vibrateError()
    yield* put(sellGoldError(error.message))
    yield* put(inFlightFail({ flowId, errorClass: classifyError(error) }))

    AppAnalytics.track(GoldEvents.gold_sell_submit_error, {
      amount: xautAmount,
      error: error.message,
    })
    // Same revert-tag extraction as buyGoldSaga so backend can classify
    // sell reverts by hash + block from Sentry extras.
    const revertTx = (error as Error & { goldRevertedTxHash?: string }).goldRevertedTxHash
    const revertBlock = (error as Error & { goldRevertedBlock?: string }).goldRevertedBlock
    let revertSelector: string | undefined
    let revertReason: string | undefined
    if (revertTx) {
      const decoded = yield* call(extractRevertReason, revertTx as Hash)
      if (decoded) {
        revertSelector = decoded.selector
        revertReason = decoded.reason
      }
    }
    const errorCode = revertTx ? 'reverted_onchain' : classifyError(error).kind
    captureBusinessError(error, {
      feature: 'gold',
      provider: 'squid',
      action: 'sell_gold_execute',
      errorCode,
      extra: {
        xautAmount,
        toTokenId,
        ...(revertTx ? { revertedTxHash: revertTx } : {}),
        ...(revertBlock ? { revertedBlock: revertBlock } : {}),
        ...(revertSelector ? { revertSelector } : {}),
        ...(revertReason ? { revertReason } : {}),
      },
    })
  }
}

export function* goldSaga() {
  Logger.debug(TAG, 'Gold saga initialized')
  yield* takeLeading(fetchGoldPrice.type, safely(fetchGoldPriceSaga))
  yield* takeEvery(buyGoldStart.type, safely(buyGoldSaga))
  yield* takeEvery(sellGoldStart.type, safely(sellGoldSaga))
}

import * as Sentry from '@sentry/react-native'
import BigNumber from 'bignumber.js'
import { useMemo } from 'react'
import { useAsyncCallback } from 'react-async-hook'
import { SENTRY_ENABLED } from 'src/config'
import { useSelector } from 'src/redux/hooks'
import {
  FetchQuoteResponse,
  Field,
  ParsedSwapAmount,
  SwapTransaction,
  SwapType,
  UNISWAP_V4_PROVIDER,
  UniswapV4Permit2Metadata,
} from 'src/swap/types'
import { reorderForBugE } from 'src/tokens/feeCurrencyPicker'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import {
  PreparedTransactionsResult,
  TransactionRequest,
  prepareTransactions,
} from 'src/viem/prepareTransactions'
import networkConfig, { networkIdToNetwork } from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address, Hex, encodeFunctionData, erc20Abi, zeroAddress } from 'viem'

// Apply a multiplier for the decreased swap amount to account for the
// varying gas fees of different swap providers (or even the same swap)
const DECREASED_SWAP_AMOUNT_GAS_FEE_MULTIPLIER = 1.2

export const NO_QUOTE_ERROR_MESSAGE = 'No quote available'

// Marker for upstream errors that are transient by nature (429 rate limit
// exhausted, 502 squid upstream unavailable). SwapScreen recognizes this
// prefix and shows a friendlier inline "try again" notification instead of
// the generic crash sheet.
export const SWAP_UPSTREAM_TRANSIENT_ERROR = 'SWAP_UPSTREAM_TRANSIENT'

// Tag every subsequent Sentry event on the current scope with the source
// that produced the winning quote. Backend owns a dashboard that splits
// swap metrics by provider (squid vs uniswap_v4 vs future) — this is the
// wallet-side signal that feeds it. Prefer the new `source` field the
// backend introduced with the Uniswap V4 fallback; fall back to the
// legacy swapProvider; ultimately 'unknown' when neither is present so
// events remain visible on the dashboard even if the response is malformed.
function tagSwapSource(response: FetchQuoteResponse): void {
  if (!SENTRY_ENABLED) return
  const source = response.details.source ?? response.details.swapProvider ?? 'unknown'
  Sentry.setTag('swap_source', source)
}

export interface FetchSwapQuoteArgs {
  fromTokenId: string
  toTokenId: string
  /** Sell amount in whole token units (not wei) */
  amount: string
  walletAddress: string
  slippagePercentage?: string
  /** Optional signal to cancel an in-flight quote when inputs become stale. */
  signal?: AbortSignal
  /**
   * When true, Squid skips the transactionRequest build and the per-wallet
   * 10 RPS rate-limit bucket is NOT charged. Use for planning / route-
   * selection fan-out (e.g. useMultiSwapQuote running N parallel previews).
   *
   * The response has empty `to`, `data`, `value`, `gas`, `allowanceTarget`
   * fields — it is NOT executable. Use false (the default) when the user
   * commits to a route and the wallet needs the prepared transactions to
   * actually submit on-chain.
   */
  quoteOnly?: boolean
}

export interface FetchSwapQuoteResult {
  fromTokenId: string
  toTokenId: string
  /** Raw sell amount in whole token units */
  swapAmount: { FROM: BigNumber; TO: BigNumber }
  price: string
  provider: string
  estimatedPriceImpact: string | null
  /** Squid's app-fee percentage included in the price, as decimal string. */
  appFeePercentageIncludedInPrice?: string
}

// Fetch `/api/swap/quote` against the TuCop backend (proxy over Squid Router).
// Squid enforces a per-wallet rate limit of 10 RPS keyed by the userAddress we
// forward upstream. The backend passes 429 / 502 through unchanged so the
// wallet can react appropriately:
//
//   - 429 (rate limit): respect Retry-After (capped at 5s), otherwise
//     exponential 0.5s -> 1s -> 2s, up to 3 retries.
//   - 502 (squid upstream unavailable): single 1s retry, then give up.
//   - 400 (validation): NEVER retry.
//   - other: pass through.
//
// Two protections against amplifying the user's per-wallet bucket:
//   1. In-flight dedupe: identical concurrent requests (same query URL, which
//      encodes every param affecting the upstream answer) share one promise.
//   2. AbortSignal support: callers cancel in-flight fetches when their
//      inputs become stale (e.g. user keeps typing in the amount field).
const SWAP_QUOTE_429_MAX_RETRIES = 3
const SWAP_QUOTE_429_RETRY_CAP_MS = 5_000
const SWAP_QUOTE_502_MAX_RETRIES = 1
const SWAP_QUOTE_502_RETRY_DELAY_MS = 1_000

const inFlightQuoteRequests = new Map<string, Promise<Response>>()

async function fetchSwapQuoteWithBackoff(
  requestUrl: string,
  signal?: AbortSignal
): Promise<Response> {
  // Share an in-flight request for the same URL. Every caller gets a Response
  // clone — never the original — so each can independently call .json() or
  // .text() without competing for the single Response body stream.
  const existing = inFlightQuoteRequests.get(requestUrl)
  if (existing) {
    const shared = await existing
    return shared.clone()
  }

  const promise = (async (): Promise<Response> => {
    let attempts429 = 0
    let attempts502 = 0
    while (true) {
      const response = await fetch(requestUrl, signal ? { signal } : undefined)

      if (response.status === 429) {
        if (attempts429 >= SWAP_QUOTE_429_MAX_RETRIES) return response
        const retryAfterRaw = response.headers.get('retry-after')
        const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN
        const backoffMs = Number.isFinite(retryAfterSec)
          ? Math.min(retryAfterSec * 1000, SWAP_QUOTE_429_RETRY_CAP_MS)
          : Math.min(500 * 2 ** attempts429, SWAP_QUOTE_429_RETRY_CAP_MS)
        attempts429 += 1
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
        continue
      }

      if (response.status === 502) {
        if (attempts502 >= SWAP_QUOTE_502_MAX_RETRIES) return response
        attempts502 += 1
        await new Promise((resolve) => setTimeout(resolve, SWAP_QUOTE_502_RETRY_DELAY_MS))
        continue
      }

      // 2xx, 3xx, 400, other 5xx: never retry.
      return response
    }
  })()

  inFlightQuoteRequests.set(requestUrl, promise)
  // .finally() returns a derived promise that rethrows any rejection from the
  // original. Without an explicit .catch, the derived promise becomes an
  // unhandled rejection (Node logs it, jest fails the test). Swallowing here
  // only affects this side-channel; the real consumer still awaits `promise`
  // below and handles the error normally.
  promise
    .finally(() => {
      if (inFlightQuoteRequests.get(requestUrl) === promise) {
        inFlightQuoteRequests.delete(requestUrl)
      }
    })
    .catch(() => {
      /* cleanup-only side-channel; the real consumer awaits `promise` below */
    })

  // First caller gets a clone too so the cached promise still has a readable
  // body for subsequent in-flight callers.
  const settled = await promise
  return settled.clone()
}

/**
 * Lightweight quote fetcher for price discovery only - no tx preparation.
 * Used by useMultiSwapQuote to fetch N parallel quotes without React state.
 */
export async function fetchSwapQuote(args: FetchSwapQuoteArgs): Promise<FetchSwapQuoteResult> {
  const {
    fromTokenId,
    toTokenId,
    amount,
    walletAddress,
    slippagePercentage = '0.5',
    signal,
    quoteOnly,
  } = args

  // Token IDs are in the form "networkId:0xaddress"
  const fromAddress = fromTokenId.split(':')[1]
  const toAddress = toTokenId.split(':')[1]
  const fromNetworkId = fromTokenId.split(':')[0]
  const toNetworkId = toTokenId.split(':')[0]

  const params: Record<string, string> = {
    ...(toAddress && { buyToken: toAddress }),
    buyIsNative: 'false',
    buyNetworkId: toNetworkId,
    ...(fromAddress && { sellToken: fromAddress }),
    sellIsNative: 'false',
    sellNetworkId: fromNetworkId,
    sellAmount: amount,
    userAddress: walletAddress,
    slippagePercentage,
    // quoteOnly=true asks Squid to skip the executable transactionRequest
    // build, which keeps the per-wallet 10 RPS rate-limit bucket idle. The
    // response is for planning only (empty to/data/value/gas/allowanceTarget).
    // The wallet calls a fresh quote with quoteOnly=false at commit time to
    // get the real prepared transactions.
    ...(quoteOnly && { quoteOnly: 'true' }),
  }
  const queryParams = new URLSearchParams(params).toString()
  const requestUrl = `${networkConfig.getSwapQuoteUrl}?${queryParams}`
  const response = await fetchSwapQuoteWithBackoff(requestUrl, signal)

  if (!response.ok) {
    const bodyText = await response.text()
    // Tag transient upstream errors (429 rate-limit exhausted, 502 squid
    // down) so callers (useMultiSwapQuote, SwapScreen) can show a softer
    // "try again" notification instead of the generic crash sheet. The
    // legacy refreshQuote path tags the same way; keep them in sync.
    if (response.status === 429 || response.status === 502) {
      throw new Error(`${SWAP_UPSTREAM_TRANSIENT_ERROR}:${response.status}:${bodyText}`)
    }
    throw new Error(bodyText)
  }

  const quote: FetchQuoteResponse = await response.json()

  if (!quote.unvalidatedSwapTransaction) {
    throw new Error(NO_QUOTE_ERROR_MESSAGE)
  }

  tagSwapSource(quote)

  const tx = quote.unvalidatedSwapTransaction
  return {
    fromTokenId,
    toTokenId,
    swapAmount: {
      FROM: new BigNumber(tx.sellAmount),
      TO: new BigNumber(tx.buyAmount),
    },
    price: tx.price,
    provider: quote.details.swapProvider,
    estimatedPriceImpact: tx.estimatedPriceImpact,
    // Exposed so multi-step previews can aggregate appFee across legs without
    // having to call the heavier fetchSwapQuoteForExecution path. May be
    // undefined when Squid does not return an app-fee field for the route.
    appFeePercentageIncludedInPrice: tx.appFeePercentageIncludedInPrice,
  }
}

interface BaseQuoteResult {
  swapType: SwapType
  toTokenId: string
  fromTokenId: string
  swapAmount: BigNumber
  price: string
  provider: string
  estimatedPriceImpact: string | null
  preparedTransactions: PreparedTransactionsResult
  receivedAt: number
  allowanceTarget: string
  appFeePercentageIncludedInPrice: string | undefined
  sellAmount: string
  /**
   * Present ONLY when `provider === "uniswap-v4"`. SwapScreen forwards
   * this into the SwapInfo dispatched with swapStart so the wallet-side
   * uniswap-v4 saga can sign the Permit2 typed data + POST /build-tx.
   */
  permit2?: UniswapV4Permit2Metadata
}

interface SameChainQuoteResult extends BaseQuoteResult {
  swapType: 'same-chain'
}

interface CrossChainQuoteResult extends BaseQuoteResult {
  swapType: 'cross-chain'
  estimatedDurationInSeconds: number
  maxCrossChainFee: string
  estimatedCrossChainFee: string
}

export type QuoteResult = SameChainQuoteResult | CrossChainQuoteResult

async function createBaseSwapTransactions(
  fromToken: TokenBalance,
  updatedField: Field,
  unvalidatedSwapTransaction: SwapTransaction,
  walletAddress: string
) {
  const baseTransactions: TransactionRequest[] = []

  const {
    guaranteedPrice,
    buyAmount,
    sellAmount,
    allowanceTarget,
    from,
    to,
    value,
    data,
    gas,
    estimatedGasUse,
  } = unvalidatedSwapTransaction
  const amountType: string =
    updatedField === Field.TO ? ('buyAmount' as const) : ('sellAmount' as const)

  const amountToApprove =
    amountType === 'buyAmount'
      ? BigInt(new BigNumber(buyAmount).times(guaranteedPrice).toFixed(0, 0))
      : BigInt(sellAmount)

  // If the sell token is ERC-20, we need to check the allowance and add an
  // approval transaction if necessary
  if (allowanceTarget !== zeroAddress && fromToken.address) {
    const approvedAllowanceForSpender = await publicClient[
      networkIdToNetwork[fromToken.networkId]
    ].readContract({
      address: fromToken.address as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [walletAddress as Address, allowanceTarget as Address],
    })

    if (approvedAllowanceForSpender < amountToApprove) {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [allowanceTarget as Address, amountToApprove],
      })

      const approveTx: TransactionRequest = {
        from: from as Address,
        to: fromToken.address as Address,
        data,
      }
      baseTransactions.push(approveTx)
    }
  }

  // Uniswap V4 fallback: backend emits the sentinel data: "0x" and the
  // real calldata is fetched later via POST /api/swap/build-tx after the
  // wallet signs the Permit2 typed data. Do NOT push a swap tx here —
  // submitting "0x" as swap data burns gas without executing anything.
  // The uniswap-v4 saga rehydrates + submits the real tx after the
  // approve (if any) confirms.
  if (data === '0x') {
    return {
      amountToApprove,
      baseTransactions,
    }
  }

  const swapTx: TransactionRequest & { gas: bigint } = {
    from: from as Address,
    to: to as Address,
    value: BigInt(value ?? 0),
    data: data as Hex,
    // This may not be entirely accurate for now
    // without the approval transaction being executed first.
    // See https://www.notion.so/valora-inc/Fee-currency-selection-logic-4c207244893748bd85e23b754334f42d?pvs=4#8b7c27d31ebf4fca981f81e9411f86ee
    // We control this from our API.
    gas: BigInt(gas),
    // This is the estimated gas use returned by the API.
    _estimatedGasUse: estimatedGasUse != null ? BigInt(estimatedGasUse) : undefined,
  }
  baseTransactions.push(swapTx)

  return {
    amountToApprove,
    baseTransactions,
  }
}

async function prepareSwapTransactions(
  fromToken: TokenBalance,
  updatedField: Field,
  unvalidatedSwapTransaction: SwapTransaction,
  feeCurrencies: TokenBalance[],
  walletAddress: string
): Promise<PreparedTransactionsResult> {
  const { amountToApprove, baseTransactions } = await createBaseSwapTransactions(
    fromToken,
    updatedField,
    unvalidatedSwapTransaction,
    walletAddress
  )
  return prepareTransactions({
    feeCurrencies,
    spendToken: fromToken,
    spendTokenAmount: new BigNumber(amountToApprove.toString()),
    decreasedAmountGasFeeMultiplier: DECREASED_SWAP_AMOUNT_GAS_FEE_MULTIPLIER,
    baseTransactions,
    // We still want to prepare the transactions even if the user doesn't have enough balance
    throwOnSpendTokenAmountExceedsBalance: false,
    origin: 'swap',
  })
}

function useSwapQuote({
  networkId,
  slippagePercentage,
  enableAppFee,
}: {
  networkId: NetworkId
  slippagePercentage: string
  enableAppFee: boolean
}) {
  const walletAddress = useSelector(walletAddressSelector)
  const rawFeeCurrencies = useSelector((state) => feeCurrenciesSelector(state, networkId))
  // Bug E: the shared selector returns CELO at index 0, and prepareTransactions
  // (called inside prepareSwapTransactions below) locks in the first viable
  // entry. Demote CELO to the end of the array so any visible stable is
  // preferred. CELO remains in the list as a last-resort fallback for the
  // rare case where every stable fails the gas check.
  const feeCurrencies = useMemo(() => reorderForBugE(rawFeeCurrencies), [rawFeeCurrencies])

  const refreshQuote = useAsyncCallback(
    async (
      fromToken: TokenBalance,
      toToken: TokenBalance,
      swapAmount: ParsedSwapAmount,
      updatedField: Field
    ): Promise<QuoteResult | null> => {
      if (!walletAddress) {
        // should never happen
        Logger.error('SwapScreen@useSwapQuote', 'No wallet address found when refreshing quote')
        return null
      }

      if (!swapAmount[updatedField].gt(0)) {
        return null
      }

      const decimals = updatedField === Field.FROM ? fromToken.decimals : toToken.decimals
      const swapAmountInWei = new BigNumber(swapAmount[updatedField]).shiftedBy(decimals)
      if (swapAmountInWei.lte(0)) {
        return null
      }

      const swapAmountParam = updatedField === Field.FROM ? 'sellAmount' : 'buyAmount'
      const params = {
        ...(toToken.address && { buyToken: toToken.address }),
        buyIsNative: (toToken.isNative ?? false).toString(),
        buyNetworkId: toToken.networkId,
        ...(fromToken.address && { sellToken: fromToken.address }),
        sellIsNative: (fromToken.isNative ?? false).toString(),
        sellNetworkId: fromToken.networkId,
        [swapAmountParam]: swapAmountInWei.toFixed(0, BigNumber.ROUND_DOWN),
        userAddress: walletAddress ?? '',
        slippagePercentage,
        ...(enableAppFee === true && { enableAppFee: enableAppFee.toString() }),
      }
      const queryParams = new URLSearchParams({ ...params }).toString()
      const requestUrl = `${networkConfig.getSwapQuoteUrl}?${queryParams}`
      const response = await fetchSwapQuoteWithBackoff(requestUrl)

      if (!response.ok) {
        const bodyText = await response.text()
        // Tag transient upstream errors so the SwapScreen can show a softer
        // "try again" inline notification instead of the generic "Algo no
        // salio como esperabamos" sheet that the wallet uses for unexpected
        // failures. 429 reaches here only after the in-flight wrapper has
        // exhausted its 3 retries; 502 only after the wrapper's single retry.
        if (response.status === 429 || response.status === 502) {
          throw new Error(`${SWAP_UPSTREAM_TRANSIENT_ERROR}:${response.status}:${bodyText}`)
        }
        throw new Error(bodyText)
      }

      const quote: FetchQuoteResponse = await response.json()

      if (!quote.unvalidatedSwapTransaction) {
        throw new Error(NO_QUOTE_ERROR_MESSAGE)
      }

      tagSwapSource(quote)

      const swapPrice = quote.unvalidatedSwapTransaction.price
      const price =
        updatedField === Field.FROM
          ? swapPrice
          : new BigNumber(1).div(new BigNumber(swapPrice)).toFixed()
      const estimatedPriceImpact = quote.unvalidatedSwapTransaction.estimatedPriceImpact
      const preparedTransactions = await prepareSwapTransactions(
        fromToken,
        updatedField,
        quote.unvalidatedSwapTransaction,
        feeCurrencies,
        walletAddress
      )

      const baseQuoteResult: BaseQuoteResult = {
        swapType: quote.unvalidatedSwapTransaction.swapType,
        toTokenId: toToken.tokenId,
        fromTokenId: fromToken.tokenId,
        swapAmount: swapAmount[updatedField],
        price,
        provider: quote.details.swapProvider,
        estimatedPriceImpact,
        preparedTransactions,
        receivedAt: Date.now(),
        appFeePercentageIncludedInPrice:
          quote.unvalidatedSwapTransaction.appFeePercentageIncludedInPrice,
        allowanceTarget: quote.unvalidatedSwapTransaction.allowanceTarget,
        sellAmount: quote.unvalidatedSwapTransaction.sellAmount,
        permit2: quote.details.permit2,
      }

      if (quote.unvalidatedSwapTransaction.swapType === 'cross-chain') {
        return {
          ...baseQuoteResult,
          estimatedDurationInSeconds: quote.unvalidatedSwapTransaction.estimatedDuration,
          maxCrossChainFee: quote.unvalidatedSwapTransaction.maxCrossChainFee,
          estimatedCrossChainFee: quote.unvalidatedSwapTransaction.estimatedCrossChainFee,
        }
      } else {
        return baseQuoteResult as SameChainQuoteResult
      }
    },
    {
      // Keep last result when refreshing
      setLoading: (state) => ({ ...state, loading: true }),
      onError: (error: Error) => {
        Logger.warn('SwapScreen@useSwapQuote', 'error from approve swap url', error)
      },
    }
  )

  const clearQuote = () => {
    refreshQuote.reset()
  }

  return {
    quote: refreshQuote.result ?? null,
    refreshQuote: refreshQuote.execute,
    fetchSwapQuoteError: refreshQuote.error,
    fetchingSwapQuote: refreshQuote.loading,
    clearQuote,
  }
}

export interface FetchSwapQuoteForExecutionArgs extends FetchSwapQuoteArgs {
  fromToken: TokenBalance
  feeCurrencies: TokenBalance[]
}

export interface FetchSwapQuoteForExecutionResult extends FetchSwapQuoteResult {
  preparedTransactions: PreparedTransactionsResult
  receivedAt: number
  appFeePercentageIncludedInPrice: string | undefined
  allowanceTarget: string
  sellAmount: string
  swapType: SwapType
  /**
   * Present ONLY when `provider === "uniswap-v4"`. The wallet-side flow
   * follows the Permit2 -> build-tx -> execute path documented in
   * UniswapV4Permit2Metadata + spec section 12. When present, the
   * returned `preparedTransactions.transactions` contains at most the
   * ERC20 approve to Permit2; the swap tx itself is NOT prebuilt (data
   * is the sentinel "0x"). The uniswap-v4 saga rehydrates the real
   * calldata via /api/swap/build-tx after signing.
   */
  permit2?: UniswapV4Permit2Metadata
}

// Heavy variant: fetches a quote AND builds approve + swap transactions.
// Used by the multi-step orchestrator saga right before each step.
// NOT for UI previews -- use the light fetchSwapQuote for those.
export async function fetchSwapQuoteForExecution(
  args: FetchSwapQuoteForExecutionArgs
): Promise<FetchSwapQuoteForExecutionResult> {
  const {
    fromTokenId,
    toTokenId,
    amount,
    walletAddress,
    slippagePercentage = '0.5',
    fromToken,
    feeCurrencies,
  } = args

  const fromAddress = fromTokenId.split(':')[1]
  const toAddress = toTokenId.split(':')[1]
  const fromNetworkId = fromTokenId.split(':')[0]
  const toNetworkId = toTokenId.split(':')[0]

  const params: Record<string, string> = {
    ...(toAddress && { buyToken: toAddress }),
    buyIsNative: 'false',
    buyNetworkId: toNetworkId,
    ...(fromAddress && { sellToken: fromAddress }),
    sellIsNative: 'false',
    sellNetworkId: fromNetworkId,
    sellAmount: amount,
    userAddress: walletAddress,
    slippagePercentage,
  }
  const queryParams = new URLSearchParams(params).toString()
  const requestUrl = `${networkConfig.getSwapQuoteUrl}?${queryParams}`
  const response = await fetchSwapQuoteWithBackoff(requestUrl)

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const quote: FetchQuoteResponse = await response.json()

  if (!quote.unvalidatedSwapTransaction) {
    throw new Error(NO_QUOTE_ERROR_MESSAGE)
  }

  tagSwapSource(quote)

  const tx = quote.unvalidatedSwapTransaction
  // Defensive: a planning quote (quoteOnly=true) returns empty to/data/from
  // and is NOT executable. This branch should only ever see a commit quote
  // (quoteOnly=false). If we somehow got a planning response here it means
  // a caller wired the wrong endpoint and we'd silently broadcast garbage.
  //
  // For uniswap-v4 responses, `data` is the sentinel "0x" by design — the
  // real calldata is fetched via /api/swap/build-tx AFTER the wallet
  // signs the Permit2 typed data. In that branch we require `to` +
  // `from` + a valid permit2 bundle instead of `data`.
  const isUniswapV4 = quote.details.swapProvider === UNISWAP_V4_PROVIDER && !!quote.details.permit2
  if (!tx.from || !tx.to || (!isUniswapV4 && !tx.data)) {
    throw new Error(
      `fetchSwapQuoteForExecution received a non-executable quote (likely a planning quoteOnly=true response). Refusing to build transactions.`
    )
  }
  const preparedTransactions = await prepareSwapTransactions(
    fromToken,
    Field.FROM,
    tx,
    feeCurrencies,
    walletAddress
  )

  return {
    fromTokenId,
    toTokenId,
    swapAmount: {
      FROM: new BigNumber(tx.sellAmount),
      TO: new BigNumber(tx.buyAmount),
    },
    price: tx.price,
    provider: quote.details.swapProvider,
    estimatedPriceImpact: tx.estimatedPriceImpact,
    preparedTransactions,
    receivedAt: Date.now(),
    appFeePercentageIncludedInPrice: tx.appFeePercentageIncludedInPrice,
    allowanceTarget: tx.allowanceTarget,
    sellAmount: tx.sellAmount,
    swapType: tx.swapType,
    permit2: quote.details.permit2,
  }
}

export default useSwapQuote

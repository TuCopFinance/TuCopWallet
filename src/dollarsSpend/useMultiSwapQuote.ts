import BigNumber from 'bignumber.js'
import { useEffect, useState } from 'react'
import { SpendStep } from 'src/dollarsSpend/types'
import Logger from 'src/utils/Logger'
import { useSelector } from 'src/redux/hooks'
import { FetchSwapQuoteResult, fetchSwapQuote } from 'src/swap/useSwapQuote'
import { walletAddressSelector } from 'src/web3/selectors'

const TAG = 'dollarsSpend/useMultiSwapQuote'

// Wait this long after the user's last input before firing N parallel quotes.
// Squid enforces a 10 RPS per-wallet limit; for a 3-token Dolares plan we hit
// it with 3 simultaneous requests per change. Debouncing collapses keystroke
// bursts into a single batch and keeps headroom for retries.
const MULTI_QUOTE_DEBOUNCE_MS = 500

interface UseMultiSwapQuoteResult {
  loading: boolean
  totalInUsd: BigNumber
  totalOutToken: BigNumber
  perStepQuotes: FetchSwapQuoteResult[]
  // USD value of the planned steps that could NOT be quoted (no Squid route
  // for that fromToken -> toToken pair, etc.). 0 when all steps resolve.
  unquotedUsd: BigNumber
  // Sum of (step.amountUsd * stepQuote.appFeePercentageIncludedInPrice / 100)
  // across fulfilled quotes. Surfaced so the SwapScreen can show a real
  // "Tarifa de TuCop" for the aggregate Dolares -> Pesos path instead of
  // falling back to "Desconocido".
  aggregateAppFeeUsd: BigNumber
  error?: Error
}

export function useMultiSwapQuote(
  steps: SpendStep[],
  toTokenId: string,
  // ERC-20 decimals of the settlement token. Used to shift the wei-denominated
  // `buyAmount` returned by getSwapQuote back into whole units before exposing
  // `totalOutToken` to the UI. Project rule: never surface wei to user-facing
  // displays - always convert at the boundary.
  toTokenDecimals: number
): UseMultiSwapQuoteResult {
  const walletAddress = useSelector(walletAddressSelector)
  const [loading, setLoading] = useState(steps.length > 0)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [perStepQuotes, setPerStepQuotes] = useState<FetchSwapQuoteResult[]>([])
  const [totalOutToken, setTotalOutToken] = useState<BigNumber>(new BigNumber(0))
  const [unquotedUsd, setUnquotedUsd] = useState<BigNumber>(new BigNumber(0))
  const [aggregateAppFeeUsd, setAggregateAppFeeUsd] = useState<BigNumber>(new BigNumber(0))

  const totalInUsd = steps.reduce((sum, s) => sum.plus(s.amountUsd), new BigNumber(0))

  // Depend on the serialized list of (tokenId, amount) pairs so the effect
  // re-fires only when the steps actually change.
  const stepsKey = steps.map((s) => `${s.tokenId}:${s.amountTokenWhole.toString()}`).join(',')

  useEffect(() => {
    if (steps.length === 0 || !walletAddress) {
      setLoading(false)
      setPerStepQuotes([])
      setTotalOutToken(new BigNumber(0))
      setUnquotedUsd(new BigNumber(0))
      setAggregateAppFeeUsd(new BigNumber(0))
      setError(undefined)
      return
    }

    // Mark loading while debouncing too — UI should show spinner the whole
    // time, not flicker between idle and loading on each keystroke.
    setLoading(true)
    setError(undefined)

    // AbortController is shared across all N parallel quotes for this effect
    // cycle. When the user keeps typing (or unmounts), the cleanup function
    // aborts every in-flight quote so we don't write stale data to state and,
    // critically, don't keep the user's per-wallet Squid bucket overdrawn.
    const controller = new AbortController()
    let cancelled = false

    const debounceTimer = setTimeout(() => {
      if (cancelled) return
      void Promise.allSettled(
        steps.map((step) => {
          // The /getSwapQuote endpoint expects the sell amount in the token's
          // smallest unit (wei). The planner carries the amount in whole units,
          // so shift by the token's decimals here. ROUND_DOWN avoids ever
          // requesting more than the user actually holds.
          const amountInWei = step.amountTokenWhole
            .shiftedBy(step.decimals)
            .toFixed(0, BigNumber.ROUND_DOWN)
          return fetchSwapQuote({
            fromTokenId: step.tokenId,
            toTokenId,
            amount: amountInWei,
            walletAddress,
            signal: controller.signal,
            // Planning fan-out: N parallel quotes for the same wallet that
            // would otherwise drain the Squid 10 RPS bucket. quoteOnly=true
            // tells Squid to skip the executable tx build (no rate-limit
            // charge), and the saga later refetches with quoteOnly=false at
            // commit time via fetchSwapQuoteForExecution.
            quoteOnly: true,
          })
        })
      ).then((settled) => {
        if (cancelled) return
        const fulfilled: FetchSwapQuoteResult[] = []
        let missingUsd = new BigNumber(0)
        let lastError: Error | undefined
        settled.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            fulfilled.push(result.value)
          } else {
            const step = steps[index]
            missingUsd = missingUsd.plus(step.amountUsd)
            const reason =
              result.reason instanceof Error ? result.reason : new Error(String(result.reason))
            // AbortError is expected when inputs change mid-flight; don't
            // surface it as an error to the UI or to logs.
            if (reason.name === 'AbortError') {
              return
            }
            lastError = reason
            Logger.warn(
              TAG,
              `Quote unavailable for step ${index} (${step.symbol}, $${step.amountUsd.toFormat(2)}): ${reason.message}`
            )
          }
        })
        // q.swapAmount.TO is the API's `buyAmount` in wei. Sum in wei (exact),
        // then shift once to whole units for display.
        const sumOutWei = fulfilled.reduce((sum, q) => sum.plus(q.swapAmount.TO), new BigNumber(0))
        const sumOutWhole = sumOutWei.shiftedBy(-toTokenDecimals)
        // Aggregate app-fee in USD: sum across legs of
        //   step.amountUsd * (stepQuote.appFeePercentageIncludedInPrice / 100).
        // Squid returns appFeePercentageIncludedInPrice as a string decimal
        // (e.g. "0.6" for 0.6%); legs without the field contribute 0.
        const sumAppFeeUsd = fulfilled.reduce((sum, q, i) => {
          const pct = new BigNumber(q.appFeePercentageIncludedInPrice ?? 0)
          if (!pct.isFinite() || pct.lte(0)) return sum
          const step = steps[i]
          if (!step) return sum
          return sum.plus(step.amountUsd.multipliedBy(pct).dividedBy(100))
        }, new BigNumber(0))
        setPerStepQuotes(fulfilled)
        setTotalOutToken(sumOutWhole)
        setUnquotedUsd(missingUsd)
        setAggregateAppFeeUsd(sumAppFeeUsd)
        // Only surface error when nothing could be quoted; partial success
        // is a recoverable state for the UI.
        setError(fulfilled.length === 0 ? lastError : undefined)
        setLoading(false)
      })
    }, MULTI_QUOTE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(debounceTimer)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey, toTokenId, walletAddress])

  return {
    loading,
    totalInUsd,
    totalOutToken,
    perStepQuotes,
    unquotedUsd,
    aggregateAppFeeUsd,
    error,
  }
}

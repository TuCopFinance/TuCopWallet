import BigNumber from 'bignumber.js'
import { useEffect, useState } from 'react'
import { SpendStep } from 'src/dollarsSpend/types'
import Logger from 'src/utils/Logger'
import { useSelector } from 'src/redux/hooks'
import { FetchSwapQuoteResult, fetchSwapQuote } from 'src/swap/useSwapQuote'
import { walletAddressSelector } from 'src/web3/selectors'

const TAG = 'dollarsSpend/useMultiSwapQuote'

interface UseMultiSwapQuoteResult {
  loading: boolean
  totalInUsd: BigNumber
  totalOutToken: BigNumber
  perStepQuotes: FetchSwapQuoteResult[]
  // USD value of the planned steps that could NOT be quoted (no Squid route
  // for that fromToken -> toToken pair, etc.). 0 when all steps resolve.
  unquotedUsd: BigNumber
  error?: Error
}

export function useMultiSwapQuote(steps: SpendStep[], toTokenId: string): UseMultiSwapQuoteResult {
  const walletAddress = useSelector(walletAddressSelector)
  const [loading, setLoading] = useState(steps.length > 0)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [perStepQuotes, setPerStepQuotes] = useState<FetchSwapQuoteResult[]>([])
  const [totalOutToken, setTotalOutToken] = useState<BigNumber>(new BigNumber(0))
  const [unquotedUsd, setUnquotedUsd] = useState<BigNumber>(new BigNumber(0))

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
      setError(undefined)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(undefined)

    // Use allSettled instead of all: one missing Squid route shouldn't zero
    // out the whole aggregated quote. The UI still surfaces the missing USD
    // amount via `unquotedUsd` so callers can show a partial-coverage banner.
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
          lastError = reason
          Logger.warn(
            TAG,
            `Quote unavailable for step ${index} (${step.symbol}, $${step.amountUsd.toFormat(2)}): ${reason.message}`
          )
        }
      })
      const sumOut = fulfilled.reduce((sum, q) => sum.plus(q.swapAmount.TO), new BigNumber(0))
      setPerStepQuotes(fulfilled)
      setTotalOutToken(sumOut)
      setUnquotedUsd(missingUsd)
      // Only surface error when nothing could be quoted; partial success
      // is a recoverable state for the UI.
      setError(fulfilled.length === 0 ? lastError : undefined)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey, toTokenId, walletAddress])

  return {
    loading,
    totalInUsd,
    totalOutToken,
    perStepQuotes,
    unquotedUsd,
    error,
  }
}

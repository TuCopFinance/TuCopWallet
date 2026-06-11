import BigNumber from 'bignumber.js'
import { useEffect, useState } from 'react'
import { SpendStep } from 'src/dollarsSpend/types'
import { useSelector } from 'src/redux/hooks'
import { FetchSwapQuoteResult, fetchSwapQuote } from 'src/swap/useSwapQuote'
import { walletAddressSelector } from 'src/web3/selectors'

interface UseMultiSwapQuoteResult {
  loading: boolean
  totalInUsd: BigNumber
  totalOutToken: BigNumber
  perStepQuotes: FetchSwapQuoteResult[]
  error?: Error
}

export function useMultiSwapQuote(steps: SpendStep[], toTokenId: string): UseMultiSwapQuoteResult {
  const walletAddress = useSelector(walletAddressSelector)
  const [loading, setLoading] = useState(steps.length > 0)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [perStepQuotes, setPerStepQuotes] = useState<FetchSwapQuoteResult[]>([])
  const [totalOutToken, setTotalOutToken] = useState<BigNumber>(new BigNumber(0))

  const totalInUsd = steps.reduce((sum, s) => sum.plus(s.amountUsd), new BigNumber(0))

  // Depend on the serialized list of (tokenId, amount) pairs so the effect
  // re-fires only when the steps actually change.
  const stepsKey = steps.map((s) => `${s.tokenId}:${s.amountTokenWhole.toString()}`).join(',')

  useEffect(() => {
    if (steps.length === 0 || !walletAddress) {
      setLoading(false)
      setPerStepQuotes([])
      setTotalOutToken(new BigNumber(0))
      setError(undefined)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(undefined)

    Promise.all(
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
    )
      .then((results) => {
        if (cancelled) return
        const sumOut = results.reduce((sum, q) => sum.plus(q.swapAmount.TO), new BigNumber(0))
        setPerStepQuotes(results)
        setTotalOutToken(sumOut)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
        setPerStepQuotes([])
        setTotalOutToken(new BigNumber(0))
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
    error,
  }
}

import { useEffect, useState } from 'react'
import {
  MentoDirection,
  MentoOracleUnavailableError,
  MentoQuote,
  quoteMentoSwap,
} from 'src/bridgeramp/mentoRouter'
import Logger from 'src/utils/Logger'

const TAG = 'bridgeramp/useMentoQuote'

// Debounce user typing before asking the chain for a quote.
const QUOTE_DEBOUNCE_MS = 400

export type MentoQuoteState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; quote: MentoQuote }
  | { state: 'oracle-unavailable' }
  | { state: 'error' }

// Live Mento quote for `amountIn` (base units), re-fetched when the amount
// changes and every `refreshMs` so a quote on screen never goes stale past
// the execution TTL. `amountIn` null means nothing to quote.
export function useMentoQuote(
  direction: MentoDirection,
  amountIn: bigint | null,
  refreshMs: number = 60_000
): MentoQuoteState {
  const [quoteState, setQuoteState] = useState<MentoQuoteState>({ state: 'idle' })
  // bigint is not a stable dependency for React; compare by string.
  const amountKey = amountIn === null ? null : amountIn.toString()

  useEffect(() => {
    if (amountKey === null) {
      setQuoteState({ state: 'idle' })
      return
    }
    let cancelled = false
    let refresh: ReturnType<typeof setInterval> | undefined

    const fetchQuote = () => {
      quoteMentoSwap(direction, BigInt(amountKey))
        .then((quote) => {
          if (!cancelled) setQuoteState({ state: 'ready', quote })
        })
        .catch((error) => {
          if (cancelled) return
          if (error instanceof MentoOracleUnavailableError) {
            setQuoteState({ state: 'oracle-unavailable' })
            return
          }
          Logger.warn(TAG, 'quote failed', error)
          setQuoteState({ state: 'error' })
        })
    }

    setQuoteState({ state: 'loading' })
    const timer = setTimeout(() => {
      fetchQuote()
      refresh = setInterval(fetchQuote, refreshMs)
    }, QUOTE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (refresh) clearInterval(refresh)
    }
  }, [amountKey, direction, refreshMs])

  return quoteState
}

import { startInactiveSpan, spanToJSON } from '@sentry/core'
import type { Span } from '@sentry/core'
import { SentryTransaction, SentryTransactions } from 'src/sentry/SentryTransactions'
import { SENTRY_ENABLED } from 'src/config'

let spans = [] as Array<Span>

export const SentryTransactionHub = {
  startTransaction(name: SentryTransaction) {
    // Skip if Sentry is not enabled (dev mode)
    if (!SENTRY_ENABLED) {
      return
    }
    try {
      const span = startInactiveSpan({ ...SentryTransactions[name] })
      spans.push(span)
    } catch (error) {
      // Silently fail in development
    }
  },
  finishTransaction(name: SentryTransaction) {
    // Skip if Sentry is not enabled (dev mode)
    if (!SENTRY_ENABLED) {
      return
    }
    // get transaction operation - 'op'
    const op = SentryTransactions[name].op

    // Find first the span with this op.
    const selectedSpan = spans.find((span) => span && spanToJSON(span).op === op)

    // End the selected span
    try {
      selectedSpan?.end()
    } catch (error) {
      // Silently fail in development
    }

    // Remove all spans matching op from the hub
    spans = spans.filter((span) => span && spanToJSON(span).op !== op)
  },
}

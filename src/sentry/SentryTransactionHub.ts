import * as Sentry from '@sentry/react-native'
import { SentryTransaction, SentryTransactions } from 'src/sentry/SentryTransactions'
import { SENTRY_ENABLED } from 'src/config'

// Store active spans for transaction tracking
type SpanWithOp = { span: ReturnType<typeof Sentry.startInactiveSpan> | undefined; op: string }
let activeSpans = [] as Array<SpanWithOp>

export const SentryTransactionHub = {
  startTransaction(name: SentryTransaction) {
    // Skip if Sentry is not enabled (dev mode)
    if (!SENTRY_ENABLED) {
      return
    }
    try {
      const transactionConfig = SentryTransactions[name]
      // Use startInactiveSpan with the transaction configuration
      const span = Sentry.startInactiveSpan({
        name: transactionConfig.name,
        op: transactionConfig.op,
        forceTransaction: true,
      })
      activeSpans.push({ span, op: transactionConfig.op })
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
    const selectedSpanObj = activeSpans.find(
      (spanObj) => spanObj && spanObj.op === SentryTransactions[name].op
    )

    // Finish the selected span
    try {
      selectedSpanObj?.span?.end()
    } catch (error) {
      // Silently fail in development
    }

    // Remove all spans matching op from the hub
    activeSpans = activeSpans.filter((spanObj) => spanObj && spanObj.op !== op)
  },
}

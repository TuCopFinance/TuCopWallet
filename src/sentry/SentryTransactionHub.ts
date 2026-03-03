import * as Sentry from '@sentry/react-native'
import Logger from 'src/utils/Logger'
import { SentryTransaction, SentryTransactions } from 'src/sentry/SentryTransactions'
import { SENTRY_ENABLED } from 'src/config'

const TAG = 'sentry/SentryTransactionHub'

let transactions = [] as Array<ReturnType<typeof Sentry.startTransaction>>

export const SentryTransactionHub = {
  startTransaction(name: SentryTransaction) {
    // Skip if Sentry is not enabled (dev mode)
    if (!SENTRY_ENABLED) {
      return
    }
    // Check if Sentry.startTransaction is available
    if (typeof Sentry.startTransaction !== 'function') {
      return
    }
    try {
      const transaction = Sentry.startTransaction({ ...SentryTransactions[name], trimEnd: true })
      transactions.push(transaction)
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

    // Find first the transaction with this op.
    const selectedTransaction = transactions.find(
      (transaction) => transaction && transaction.op === SentryTransactions[name].op
    )

    // Finish the selected transaction
    try {
      selectedTransaction?.finish()
    } catch (error) {
      // Silently fail in development
    }

    // Remove all transactions matching op from the transaction hub
    transactions = transactions.filter((transaction) => transaction && transaction.op !== op)
  },
}

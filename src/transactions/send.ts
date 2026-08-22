import { ErrorMessages } from 'src/app/ErrorMessages'
import Logger from 'src/utils/Logger'

const TAG = 'transactions/send'

const NONCE_TOO_LOW_ERROR = 'nonce too low'
const KNOWN_TX_ERROR = 'known transaction'
const CHECK_FOR_TX_RECEIPT_ERROR = 'failed to check for transaction receipt'

/**
 * Given an error thrown while attempting a transaction,
 * checks to see if that error could indicate that the transaction intent already
 * exists on the blockchain.
 **/
export function isTxPossiblyPending(err: any): boolean {
  if (!err || !err.message || typeof err.message !== 'string') {
    return false
  }

  // These branches classify errors that ACTUALLY mean the tx is (or was)
  // successfully on-chain. They are not failures. Downgraded to info so
  // they stop appearing as red Logger.error in dev + do not clutter any
  // future console-error routing to Sentry.
  if (err.message === ErrorMessages.TRANSACTION_TIMEOUT) {
    Logger.info(`${TAG}@isTxPossiblyPending`, 'Transaction timed out. Will not reattempt.')
    return true
  }

  const message = err.message.toLowerCase()

  if (message.includes(KNOWN_TX_ERROR)) {
    Logger.info(`${TAG}@isTxPossiblyPending`, 'Known transaction error. Will not reattempt.')
    return true
  }

  if (message.includes(NONCE_TOO_LOW_ERROR)) {
    Logger.info(
      `${TAG}@isTxPossiblyPending`,
      'Nonce too low, possible from retrying. Will not reattempt.'
    )
    return true
  }

  if (message.includes(CHECK_FOR_TX_RECEIPT_ERROR)) {
    Logger.info(
      `${TAG}@isTxPossiblyPending`,
      'Failed to check for tx receipt, but tx still might be confirmed. Will not reattempt'
    )
    return true
  }
  return false
}

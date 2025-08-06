import { VIEM_TRANSPORT_CONFIG } from './config'
import { Hash, PublicClient, TransactionReceipt } from 'viem'
import Logger from 'src/utils/Logger'

const TAG = 'viem/transaction'

/**
 * Wait for transaction receipt with timeout
 * This is especially important for devices (like some Xiaomi models) that may have
 * connectivity issues causing transactions to hang indefinitely
 */
export async function waitForTransactionReceiptWithTimeout(
  client: PublicClient,
  hash: Hash,
  timeoutMs: number = VIEM_TRANSPORT_CONFIG.transactionReceiptTimeout
): Promise<TransactionReceipt> {
  return new Promise<TransactionReceipt>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout
    let resolved = false

    // Set timeout
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true
        Logger.warn(TAG, `Transaction receipt timeout for hash ${hash} after ${timeoutMs}ms`)
        reject(new Error(`Transaction receipt timeout after ${timeoutMs}ms`))
      }
    }, timeoutMs)

    // Wait for receipt
    client
      .waitForTransactionReceipt({ hash })
      .then((receipt) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeoutId)
          resolve(receipt)
        }
      })
      .catch((error) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeoutId)
          reject(error)
        }
      })
  })
}

/**
 * Check if a transaction is stuck in pending state
 * This can happen on some devices due to connectivity issues
 */
export async function isTransactionStuck(
  client: PublicClient,
  hash: Hash,
  maxCheckTimeMs: number = 30000
): Promise<boolean> {
  try {
    const startTime = Date.now()

    while (Date.now() - startTime < maxCheckTimeMs) {
      const transaction = await client.getTransaction({ hash })

      // If transaction is found and has a block number, it's not stuck
      if (transaction && transaction.blockNumber) {
        return false
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    // If we've been checking for maxCheckTimeMs and still no block, it's likely stuck
    Logger.warn(TAG, `Transaction ${hash} appears to be stuck after ${maxCheckTimeMs}ms`)
    return true
  } catch (error) {
    Logger.error(TAG, `Error checking if transaction is stuck: ${error}`)
    return false
  }
}

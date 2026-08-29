import BigNumber from 'bignumber.js'
import type { TransactionReceipt } from 'viem'
import type { TokenBalance } from 'src/tokens/slice'
import type { NetworkId } from 'src/transactions/types'
import type { PublicClient } from 'viem'
import Logger from 'src/utils/Logger'

const TAG = 'swap/computeReceiptNetworkFee'

// Saga-side helper: reads the receipt already produced by
// waitForTransactionReceipt, fetches the tx envelope to learn the
// feeCurrency (CIP-64 adapter address for stables, undefined for native CELO
// gas), and returns the {value, tokenId, decimals} tuple the success screen
// needs. Runs synchronously as part of the swap saga so the value is baked
// into the success-screen route params instead of relying on a React hook
// that races render and can silently bail on adapter resolution.
export async function computeReceiptNetworkFee({
  publicClient,
  receipt,
  networkId,
  nativeFeeCurrency,
  tokensById,
}: {
  publicClient: PublicClient
  receipt: TransactionReceipt
  networkId: NetworkId
  nativeFeeCurrency: TokenBalance | undefined
  tokensById: Record<string, TokenBalance | undefined>
}): Promise<{ value: string; tokenId: string } | null> {
  try {
    const tx = await publicClient.getTransaction({ hash: receipt.transactionHash })
    const gasUsed = new BigNumber(receipt.gasUsed.toString())
    const effectiveGasPrice = new BigNumber(receipt.effectiveGasPrice.toString())
    const feeWei = gasUsed.multipliedBy(effectiveGasPrice)

    const feeCurrencyAddress = (tx as { feeCurrency?: string | null }).feeCurrency
    if (!feeCurrencyAddress) {
      // Native CELO gas. Use the synthesized fee-currency entry (may be
      // absent on fresh installs; caller decides whether to persist nothing
      // and let the tx-details screen fill in later).
      if (!nativeFeeCurrency) {
        Logger.warn(TAG, 'No native fee currency in state', { txHash: receipt.transactionHash })
        return null
      }
      const value = feeWei.shiftedBy(-nativeFeeCurrency.decimals).toString()
      return { value, tokenId: nativeFeeCurrency.tokenId }
    }

    const lookup = feeCurrencyAddress.toLowerCase()
    const values = Object.values(tokensById)
    const matchedByAdapter = values.find(
      (tok) => tok?.feeCurrencyAdapterAddress?.toLowerCase() === lookup
    )
    const matchedByToken = matchedByAdapter
      ? undefined
      : values.find((tok) => tok?.address?.toLowerCase() === lookup)
    const matched = matchedByAdapter ?? matchedByToken
    if (!matched) {
      Logger.warn(TAG, 'Unknown CIP-64 fee currency address', {
        feeCurrencyAddress,
        txHash: receipt.transactionHash,
      })
      return null
    }
    const decimals = matchedByAdapter?.feeCurrencyAdapterDecimals ?? matched.decimals
    const value = feeWei.shiftedBy(-decimals).toString()
    return { value, tokenId: matched.tokenId }
  } catch (err) {
    Logger.warn(TAG, 'Failed to compute network fee', {
      txHash: receipt.transactionHash,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

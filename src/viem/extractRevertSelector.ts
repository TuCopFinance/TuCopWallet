import { Hash } from 'viem'
import { publicClient } from 'src/viem'
import Logger from 'src/utils/Logger'

const TAG = 'viem/extractRevertSelector'

// Result surfaced to Sentry as structured extras. `selector` is the 4-byte
// custom-error selector when the revert data starts with 0x + 8 hex chars,
// enough for backend to look up which contract error name it maps to
// (Squid, Uniswap V3/V4, ERC20, etc) without shipping every ABI to the
// wallet bundle. `reason` is a fallback short string when viem could not
// decode a selector (e.g. Panic(uint256) or plain revert strings).
export interface RevertReason {
  selector?: string
  reason?: string
}

// Re-runs the reverted transaction via eth_call at the block it landed in.
// Returns null if we cannot extract anything useful (tx not found, RPC
// down, or the replay unexpectedly succeeds because state moved). Never
// throws so callers can pass its result straight to captureBusinessError's
// extras without an extra try/catch. Network fixed to 'celo' since that is
// the only chain the wallet transacts on today.
export async function extractRevertReason(txHash: Hash): Promise<RevertReason | null> {
  try {
    const client = publicClient.celo
    const tx = await client.getTransaction({ hash: txHash })
    if (!tx || !tx.blockNumber) return null
    try {
      // Replay at the exact block. viem throws a RawContractError / a
      // CallExecutionError with `.cause.data` (hex) when the revert data
      // is bytecode, or `.cause.reason` when it is a Solidity string.
      await client.call({
        account: tx.from,
        to: tx.to ?? undefined,
        data: tx.input,
        value: tx.value,
        blockNumber: tx.blockNumber,
        gas: tx.gas,
      })
      return null
    } catch (err) {
      const anyErr = err as {
        data?: unknown
        cause?: { data?: unknown; reason?: unknown; raw?: unknown }
        shortMessage?: unknown
        message?: unknown
      }
      const raw =
        (typeof anyErr.data === 'string' && anyErr.data) ||
        (typeof anyErr.cause?.data === 'string' && anyErr.cause.data) ||
        (typeof anyErr.cause?.raw === 'string' && anyErr.cause.raw) ||
        undefined
      if (raw && raw.startsWith('0x') && raw.length >= 10) {
        return { selector: raw.slice(0, 10) }
      }
      const reason =
        (typeof anyErr.cause?.reason === 'string' && anyErr.cause.reason) ||
        (typeof anyErr.shortMessage === 'string' && anyErr.shortMessage) ||
        (typeof anyErr.message === 'string' && anyErr.message) ||
        undefined
      if (reason) return { reason: String(reason).slice(0, 200) }
      return null
    }
  } catch (err) {
    Logger.debug(TAG, `extractRevertReason failed for ${txHash}`, err)
    return null
  }
}

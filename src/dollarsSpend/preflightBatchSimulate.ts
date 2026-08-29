import { Address, Hex } from 'viem'
import { publicClient } from 'src/viem'
import { Network } from 'src/transactions/types'
import Logger from 'src/utils/Logger'

const TAG = 'dollarsSpend/preflightBatchSimulate'

export type PreflightResult =
  | { ok: true }
  | { ok: false; kind: 'revert'; errorMessage: string }
  | { ok: false; kind: 'other'; errorMessage: string }

/**
 * Simulate the assembled BatchExecutor.execute() calldata against the current
 * chain state via `eth_call` on Forno. Returns before the tx is signed or
 * broadcast.
 *
 * Why we need this: the atomic 7702 batch bundles N Squid multicall payloads,
 * each carrying a `guaranteedPrice` frozen at quote-fetch time. If any pool
 * moves more than the slippage cushion between fetch and submit, ONE inner
 * call reverts and the whole batch aborts atomically. Without preflight, the
 * revert only surfaces via viem's `eth_estimateGas` inside `wallet.send-
 * Transaction`, at which point we've already committed to a specific fee-
 * currency choice and the user sees a hard failure.
 *
 * With preflight we can retry with fresh quotes at widened slippage BEFORE
 * paying gas, and only surface the failure to the user when the pool state is
 * genuinely intractable.
 *
 * eth_call is stateless: it does NOT reserve gas × maxFeePerGas from the
 * caller's balance and does NOT require a fee currency to be specified.
 * That's precisely what we want here - we're testing whether the INNER calls
 * of the batch succeed on the current chain state, independently of who ends
 * up paying gas.
 */
export async function preflightBatchSimulate(args: {
  walletAddress: Address
  batchExecutorCalldata: Hex
}): Promise<PreflightResult> {
  const { walletAddress, batchExecutorCalldata } = args
  try {
    await publicClient[Network.Celo].call({
      account: walletAddress,
      to: walletAddress,
      data: batchExecutorCalldata,
    })
    return { ok: true }
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err)
    // viem's `call` throws `ContractFunctionExecutionError`, `CallExecutionError`
    // or `RawContractError` on revert. All three carry "execution reverted" or
    // "reverted" in the message. Network / RPC failures produce different
    // shapes (e.g. `HttpRequestError`, `TimeoutError`) that do NOT match.
    // Distinguish so the outer retry loop can skip preflight on non-revert
    // errors (they won't be fixed by widening slippage).
    const looksLikeRevert = /reverted|revert reason|execution reverted/i.test(rawMessage)
    if (looksLikeRevert) {
      Logger.debug(TAG, `preflight reverted: ${rawMessage.slice(0, 300)}`)
      return { ok: false, kind: 'revert', errorMessage: rawMessage }
    }
    Logger.warn(TAG, `preflight failed with non-revert error: ${rawMessage.slice(0, 300)}`)
    return { ok: false, kind: 'other', errorMessage: rawMessage }
  }
}

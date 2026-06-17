import type { PublicClient } from 'viem'

export type SimulationResult =
  | { kind: 'ok' }
  | { kind: 'revert'; reason: string }
  | { kind: 'network-error'; error: unknown }

export interface SimulateArgs {
  from: `0x${string}`
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
  // Allowance amount that the approve tx would set. Recorded for traceability
  // and future state-override-based simulation; not consumed by the current
  // simple `call` strategy (Forno does not support state overrides).
  assumedAllowance: bigint
  sellToken: `0x${string}`
}

/**
 * Pre-flight simulation for a swap transaction.
 *
 * Runs the swap call against the latest state via `publicClient.call`. If the
 * call reverts, the caller should abort BEFORE emitting the approve tx so the
 * user does not end up with a dangling allowance.
 *
 * Note: a plain `eth_call` cannot simulate the approve + swap pair atomically
 * because the approve has not been mined yet. This catches the common cases
 * where the swap would revert for reasons independent of allowance (e.g.
 * slippage, paused router, insufficient liquidity). Allowance-only reverts
 * are caught by the existing approve flow.
 */
export async function simulateSwapTransaction(
  client: PublicClient,
  args: SimulateArgs
): Promise<SimulationResult> {
  try {
    await client.call({
      account: args.from,
      to: args.to,
      data: args.data,
      value: args.value,
    })
    return { kind: 'ok' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/revert|reverted/i.test(msg)) return { kind: 'revert', reason: msg }
    return { kind: 'network-error', error: err }
  }
}

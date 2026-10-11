import BigNumber from 'bignumber.js'
import { Address } from 'viem'
import { RampCall } from 'src/bridgeramp/swapCalls'
import { TokenBalance } from 'src/tokens/slice'
import {
  PreparedTransactionsResult,
  TransactionRequest,
  prepareTransactions,
} from 'src/viem/prepareTransactions'

// Gas limit for Router.swapExactTokensForTokens over the two-hop route
// (virtual pool COPm/USDm + FPMM USDm/USDC). eth_estimateGas cannot price the
// swap while the approve is still unmined (the Router's transferFrom reverts
// on allowance against LATEST state), and the generic post-approve fallback
// in prepareTransactions is 300k, which is half of what a real swap through
// the virtual pool consumed: tx
// 0x4f6b7608c83f8de10f4fabbb4c4708efa55fdf73f599de6c4d8f9d995710d16a used
// 605,278 gas (2026-10-10). Limit sits well above that; _estimatedGasUse is
// what the fee row shows and tracks the measured value.
export const BRIDGE_RAMP_SWAP_GAS_LIMIT = BigInt(900_000)
export const BRIDGE_RAMP_SWAP_ESTIMATED_GAS_USE = BigInt(650_000)

export interface PrepareBridgeRampCallsArgs {
  calls: RampCall[]
  from: Address
  // Token leaving the user's wallet (COPm for withdraw, USDC for deposit
  // conversion) and the exact base-unit amount, so prepareTransactions can
  // tell "not enough to pay gas" apart from "not enough to swap".
  spendToken: TokenBalance
  spendTokenAmount: bigint
  feeCurrencies: TokenBalance[]
}

// Turns the [approve, swap] pair from swapCalls into fee-priced transactions
// the wallet can sign. The approve is estimated normally; the swap carries a
// fixed gas limit for the reason above.
export async function prepareBridgeRampCalls(
  { calls, from, spendToken, spendTokenAmount, feeCurrencies }: PrepareBridgeRampCallsArgs,
  prepareTxs = prepareTransactions // for unit testing
): Promise<PreparedTransactionsResult> {
  if (calls.length !== 2) {
    throw new Error(`expected [approve, swap], got ${calls.length} calls`)
  }
  const [approve, swap] = calls
  const baseTransactions: TransactionRequest[] = [
    { from, to: approve.to, data: approve.data, value: approve.value },
    {
      from,
      to: swap.to,
      data: swap.data,
      value: swap.value,
      gas: BRIDGE_RAMP_SWAP_GAS_LIMIT,
      _estimatedGasUse: BRIDGE_RAMP_SWAP_ESTIMATED_GAS_USE,
    },
  ]
  return prepareTxs({
    feeCurrencies,
    spendToken,
    spendTokenAmount: new BigNumber(spendTokenAmount.toString()),
    baseTransactions,
    origin: 'bridge-ramp',
  })
}

import { Address, encodeFunctionData, erc20Abi, Hex, isAddress } from 'viem'
import {
  MENTO_ROUTER_ADDRESS_CELO,
  MentoQuote,
  encodeMentoSwap,
  inputTokenFor,
  minAmountOut,
} from 'src/bridgeramp/mentoRouter'

// Slippage cushion for ramp conversions. Mento prices off the oracle with a
// fixed spread, so the quote only moves when the oracle median does; 50 bps
// covers an oracle tick between quote and inclusion without giving much away.
export const BRIDGE_RAMP_SLIPPAGE_BPS = 50
// A quote older than this is re-fetched before building calls.
export const BRIDGE_RAMP_QUOTE_TTL_SECONDS = 120
// How long the Router may take to include the swap.
export const BRIDGE_RAMP_DEADLINE_SECONDS = 10 * 60

export interface RampCall {
  to: Address
  data: Hex
  value: bigint
}

export class StaleQuoteError extends Error {
  constructor() {
    super('Mento quote is too old to execute')
    this.name = 'StaleQuoteError'
  }
}

export class InvalidRecipientError extends Error {
  constructor(recipient: string) {
    super(`Invalid swap recipient ${recipient}`)
    this.name = 'InvalidRecipientError'
  }
}

interface BuildArgs {
  quote: MentoQuote
  // Owner of the input tokens; the ERC-20 approval is granted from here.
  user: Address
  // Where the Router delivers the output token.
  recipient: Address
  slippageBps?: number
  now?: number
}

// Two calls: approve the Router for exactly amountIn, then swap with the
// output delivered straight to `recipient`. The swap is one transaction, so
// either the output lands at `recipient` or nothing leaves the user's wallet.
function buildMentoSwapCalls({
  quote,
  user,
  recipient,
  slippageBps = BRIDGE_RAMP_SLIPPAGE_BPS,
  now = Math.floor(Date.now() / 1000),
}: BuildArgs): RampCall[] {
  if (
    !isAddress(recipient) ||
    recipient.toLowerCase() === MENTO_ROUTER_ADDRESS_CELO.toLowerCase()
  ) {
    throw new InvalidRecipientError(recipient)
  }
  if (!isAddress(user)) {
    throw new InvalidRecipientError(user)
  }
  if (now - quote.quotedAt > BRIDGE_RAMP_QUOTE_TTL_SECONDS) {
    throw new StaleQuoteError()
  }
  const amountOutMin = minAmountOut(quote, slippageBps)
  const approve: RampCall = {
    to: inputTokenFor(quote.direction),
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [MENTO_ROUTER_ADDRESS_CELO, quote.amountIn],
    }),
    value: BigInt(0),
  }
  const swap = encodeMentoSwap({
    direction: quote.direction,
    amountIn: quote.amountIn,
    amountOutMin,
    recipient,
    deadline: BigInt(now + BRIDGE_RAMP_DEADLINE_SECONDS),
  })
  return [approve, { ...swap, value: BigInt(0) }]
}

export interface WithdrawArgs {
  quote: MentoQuote
  user: Address
  // The user's own Bridge liquidation address (USDC on Celo in, COP to their
  // Bre-B key out), returned by TuCOPRamp. Never a hardcoded address.
  liquidationAddress: Address
  slippageBps?: number
  now?: number
}

// Off-ramp: COPm -> USDC, delivered by the Router directly to the user's
// liquidation address. No separate transfer step, so no USDC is ever left in
// the user's wallet and a failed swap leaves their COPm untouched.
export function buildBridgeWithdrawCalls(args: WithdrawArgs): RampCall[] {
  if (args.quote.direction !== 'copmToUsdc') {
    throw new Error('withdraw needs a copmToUsdc quote')
  }
  if (args.liquidationAddress.toLowerCase() === args.user.toLowerCase()) {
    throw new InvalidRecipientError(args.liquidationAddress)
  }
  return buildMentoSwapCalls({ ...args, recipient: args.liquidationAddress })
}

export interface DepositConversionArgs {
  quote: MentoQuote
  user: Address
  slippageBps?: number
  now?: number
}

// On-ramp: USDC that Bridge delivered to the user's wallet -> COPm, back to
// the user. Run by the app once the deposit has landed.
export function buildBridgeDepositConversionCalls(args: DepositConversionArgs): RampCall[] {
  if (args.quote.direction !== 'usdcToCopm') {
    throw new Error('deposit conversion needs a usdcToCopm quote')
  }
  return buildMentoSwapCalls({ ...args, recipient: args.user })
}

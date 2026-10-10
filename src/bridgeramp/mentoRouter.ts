import BigNumber from 'bignumber.js'
import { Address, decodeFunctionResult, encodeFunctionData, Hex } from 'viem'
import { Network } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'

const TAG = 'bridgeramp/mentoRouter'

// Mento v3 Router on Celo mainnet. Bridge Ramp converts COPm <-> USDC here
// instead of through Squid: both of TuCOP's own liquidations went through
// these same pools, and the one that called the Router directly cost 0.31%
// against the oracle rate while the Squid one cost 0.43% (Squid adds 0.125%).
// Addresses from https://docs.mento.org/mento-v3/build/deployments/addresses
// and confirmed on-chain with Router.poolFor on 2026-10-09.
export const MENTO_ROUTER_ADDRESS_CELO: Address = '0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6'
// FPMM factory: the USDC/USDm pool (0x462fe04b4FD719Cbd04C0310365D421D02AaA19E).
export const MENTO_FPMM_FACTORY_CELO: Address = '0xa849b475FE5a4B5C9C3280152c7a1945b907613b'
// Virtual pool factory: wraps the Mento v2 COPm/USDm exchange for the Router
// (pool 0x71f55035a49C972C5C3197e874f6b7Fd94672B6E).
export const MENTO_VIRTUAL_POOL_FACTORY_CELO: Address = '0x22abd4ADF6aab38aC1022352d496A07Acee5aCB3'

export const USDC_ADDRESS_CELO: Address = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'
export const USDM_ADDRESS_CELO: Address = '0x765DE816845861e75A25fCA122bb6898B8B1282a'
export const COPM_ADDRESS_CELO: Address = '0x8A567e2aE79CA692Bd748aB832081C45de4041eA'

export const USDC_DECIMALS = 6
export const COPM_DECIMALS = 18

export const MENTO_ROUTER_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'factory', type: 'address' },
        ],
      },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'factory', type: 'address' },
        ],
      },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

export type MentoDirection = 'copmToUsdc' | 'usdcToCopm'

export interface MentoRoute {
  from: Address
  to: Address
  factory: Address
}

// There is no direct USDC/COPm pool on Celo; every route goes through USDm.
export function buildRoutes(direction: MentoDirection): MentoRoute[] {
  if (direction === 'copmToUsdc') {
    return [
      { from: COPM_ADDRESS_CELO, to: USDM_ADDRESS_CELO, factory: MENTO_VIRTUAL_POOL_FACTORY_CELO },
      { from: USDM_ADDRESS_CELO, to: USDC_ADDRESS_CELO, factory: MENTO_FPMM_FACTORY_CELO },
    ]
  }
  return [
    { from: USDC_ADDRESS_CELO, to: USDM_ADDRESS_CELO, factory: MENTO_FPMM_FACTORY_CELO },
    { from: USDM_ADDRESS_CELO, to: COPM_ADDRESS_CELO, factory: MENTO_VIRTUAL_POOL_FACTORY_CELO },
  ]
}

export interface MentoQuote {
  direction: MentoDirection
  amountIn: bigint
  amountOut: bigint
  // Whole-token amounts for display (COPm has 18 decimals, USDC 6).
  amountInWhole: BigNumber
  amountOutWhole: BigNumber
  // COP per USD implied by this quote, i.e. the all-in rate the user gets.
  copPerUsd: BigNumber
  quotedAt: number
}

export class MentoOracleUnavailableError extends Error {
  constructor() {
    super('Mento COPm oracle has no valid median')
    this.name = 'MentoOracleUnavailableError'
  }
}

function decimalsFor(direction: MentoDirection): { inDecimals: number; outDecimals: number } {
  return direction === 'copmToUsdc'
    ? { inDecimals: COPM_DECIMALS, outDecimals: USDC_DECIMALS }
    : { inDecimals: USDC_DECIMALS, outDecimals: COPM_DECIMALS }
}

// Quotes the full two-hop route. Throws MentoOracleUnavailableError when the
// COPm/USDm exchange cannot price (the oracle median expired), which is the
// signal callers use to hide Bridge Ramp instead of letting the swap fail.
export async function quoteMentoSwap(
  direction: MentoDirection,
  amountIn: bigint,
  now: number = Math.floor(Date.now() / 1000)
): Promise<MentoQuote> {
  if (amountIn <= BigInt(0)) {
    throw new Error('amountIn must be positive')
  }
  const routes = buildRoutes(direction)
  let amounts: readonly bigint[]
  try {
    // readContract cannot infer the tuple[] parameter from the const ABI, so
    // the call goes through the raw client with explicit encode/decode.
    const data = encodeFunctionData({
      abi: MENTO_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, routes],
    })
    const { data: result } = await publicClient[Network.Celo].call({
      to: MENTO_ROUTER_ADDRESS_CELO,
      data,
    })
    if (!result) {
      throw new Error('empty getAmountsOut result')
    }
    amounts = decodeFunctionResult({
      abi: MENTO_ROUTER_ABI,
      functionName: 'getAmountsOut',
      data: result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('no valid median')) {
      Logger.info(TAG, 'COPm oracle median unavailable, cannot quote')
      throw new MentoOracleUnavailableError()
    }
    throw error
  }
  const amountOut = amounts[amounts.length - 1]
  const { inDecimals, outDecimals } = decimalsFor(direction)
  const amountInWhole = new BigNumber(amountIn.toString()).shiftedBy(-inDecimals)
  const amountOutWhole = new BigNumber(amountOut.toString()).shiftedBy(-outDecimals)
  const copPerUsd =
    direction === 'copmToUsdc'
      ? amountInWhole.dividedBy(amountOutWhole)
      : amountOutWhole.dividedBy(amountInWhole)
  return { direction, amountIn, amountOut, amountInWhole, amountOutWhole, copPerUsd, quotedAt: now }
}

// Minimum output for a quoted swap, in base units. `slippageBps` is the
// cushion the user accepts on top of the quote (Mento prices off the oracle
// with a fixed 0.30% spread, so the quote only moves when the oracle does).
export function minAmountOut(quote: MentoQuote, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error('slippageBps out of range')
  }
  return (quote.amountOut * BigInt(10_000 - slippageBps)) / BigInt(10_000)
}

export interface SwapCallArgs {
  direction: MentoDirection
  amountIn: bigint
  amountOutMin: bigint
  // Who receives the output token. For the off-ramp this is the user's own
  // address (the USDC is sent on to the liquidation address in the same
  // atomic batch); for the on-ramp it is also the user.
  recipient: Address
  deadline: bigint
}

// Calldata for Router.swapExactTokensForTokens. The caller must have approved
// the Router to spend `amountIn` of the input token first.
export function encodeMentoSwap(args: SwapCallArgs): { to: Address; data: Hex } {
  return {
    to: MENTO_ROUTER_ADDRESS_CELO,
    data: encodeFunctionData({
      abi: MENTO_ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [
        args.amountIn,
        args.amountOutMin,
        buildRoutes(args.direction),
        args.recipient,
        args.deadline,
      ],
    }),
  }
}

export function inputTokenFor(direction: MentoDirection): Address {
  return direction === 'copmToUsdc' ? COPM_ADDRESS_CELO : USDC_ADDRESS_CELO
}

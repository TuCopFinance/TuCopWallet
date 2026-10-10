import BigNumber from 'bignumber.js'
import { decodeFunctionData, erc20Abi } from 'viem'
import {
  COPM_ADDRESS_CELO,
  MENTO_ROUTER_ABI,
  MENTO_ROUTER_ADDRESS_CELO,
  MentoQuote,
  USDC_ADDRESS_CELO,
  buildRoutes,
} from 'src/bridgeramp/mentoRouter'
import {
  BRIDGE_RAMP_DEADLINE_SECONDS,
  InvalidRecipientError,
  StaleQuoteError,
  buildBridgeDepositConversionCalls,
  buildBridgeWithdrawCalls,
} from 'src/bridgeramp/swapCalls'

const USER = '0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856'
// TuCOP's own liquidation address, used here only as a realistic shape.
const LIQUIDATION = '0xe2d21f9bd38d4555c340395d31af39ee3b11a995'
const NOW = 1_791_600_000

const withdrawQuote: MentoQuote = {
  direction: 'copmToUsdc',
  amountIn: BigInt('800000000000000000000000'),
  amountOut: BigInt(247_338_318),
  amountInWhole: new BigNumber('800000'),
  amountOutWhole: new BigNumber('247.338318'),
  copPerUsd: new BigNumber('3234.44'),
  quotedAt: NOW - 30,
}

const depositQuote: MentoQuote = {
  direction: 'usdcToCopm',
  amountIn: BigInt(100_000_000),
  amountOut: BigInt('319000000000000000000000'),
  amountInWhole: new BigNumber('100'),
  amountOutWhole: new BigNumber('319000'),
  copPerUsd: new BigNumber('3190'),
  quotedAt: NOW - 5,
}

describe('buildBridgeWithdrawCalls', () => {
  it('approves the Router for the exact COPm amount and swaps straight to the liquidation address', () => {
    const calls = buildBridgeWithdrawCalls({
      quote: withdrawQuote,
      user: USER,
      liquidationAddress: LIQUIDATION,
      now: NOW,
    })

    expect(calls).toHaveLength(2)
    expect(calls[0].to).toBe(COPM_ADDRESS_CELO)
    expect(decodeFunctionData({ abi: erc20Abi, data: calls[0].data })).toEqual({
      functionName: 'approve',
      args: [MENTO_ROUTER_ADDRESS_CELO, withdrawQuote.amountIn],
    })

    expect(calls[1].to).toBe(MENTO_ROUTER_ADDRESS_CELO)
    const swap = decodeFunctionData({ abi: MENTO_ROUTER_ABI, data: calls[1].data })
    expect(swap.functionName).toBe('swapExactTokensForTokens')
    const [amountIn, amountOutMin, routes, recipient, deadline] = swap.args as unknown as any[]
    expect(amountIn).toBe(withdrawQuote.amountIn)
    expect(amountOutMin).toBe(BigInt(246_101_626)) // 247,338,318 less 50 bps
    expect(routes).toEqual(buildRoutes('copmToUsdc'))
    expect((recipient as string).toLowerCase()).toBe(LIQUIDATION.toLowerCase())
    expect(deadline).toBe(BigInt(NOW + BRIDGE_RAMP_DEADLINE_SECONDS))
    expect(calls.every((call) => call.value === BigInt(0))).toBe(true)
  })

  it('refuses a quote older than the TTL', () => {
    expect(() =>
      buildBridgeWithdrawCalls({
        quote: { ...withdrawQuote, quotedAt: NOW - 121 },
        user: USER,
        liquidationAddress: LIQUIDATION,
        now: NOW,
      })
    ).toThrow(StaleQuoteError)
  })

  it('refuses to send the USDC anywhere but a real liquidation address', () => {
    expect(() =>
      buildBridgeWithdrawCalls({
        quote: withdrawQuote,
        user: USER,
        liquidationAddress: USER,
        now: NOW,
      })
    ).toThrow(InvalidRecipientError)
    expect(() =>
      buildBridgeWithdrawCalls({
        quote: withdrawQuote,
        user: USER,
        liquidationAddress: 'not-an-address' as any,
        now: NOW,
      })
    ).toThrow(InvalidRecipientError)
    expect(() =>
      buildBridgeWithdrawCalls({
        quote: withdrawQuote,
        user: USER,
        liquidationAddress: MENTO_ROUTER_ADDRESS_CELO,
        now: NOW,
      })
    ).toThrow(InvalidRecipientError)
  })

  it('refuses a quote in the wrong direction', () => {
    expect(() =>
      buildBridgeWithdrawCalls({
        quote: depositQuote,
        user: USER,
        liquidationAddress: LIQUIDATION,
        now: NOW,
      })
    ).toThrow('withdraw needs a copmToUsdc quote')
  })
})

describe('buildBridgeDepositConversionCalls', () => {
  it('approves USDC and swaps it back to COPm for the user', () => {
    const calls = buildBridgeDepositConversionCalls({ quote: depositQuote, user: USER, now: NOW })

    expect(calls[0].to).toBe(USDC_ADDRESS_CELO)
    expect(decodeFunctionData({ abi: erc20Abi, data: calls[0].data })).toEqual({
      functionName: 'approve',
      args: [MENTO_ROUTER_ADDRESS_CELO, depositQuote.amountIn],
    })
    const swap = decodeFunctionData({ abi: MENTO_ROUTER_ABI, data: calls[1].data })
    expect(swap.args?.[2]).toEqual(buildRoutes('usdcToCopm'))
    expect(swap.args?.[3]).toBe(USER)
  })

  it('refuses a quote in the wrong direction', () => {
    expect(() =>
      buildBridgeDepositConversionCalls({ quote: withdrawQuote, user: USER, now: NOW })
    ).toThrow('deposit conversion needs a usdcToCopm quote')
  })
})

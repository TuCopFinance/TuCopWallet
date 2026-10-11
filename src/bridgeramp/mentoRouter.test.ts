import { decodeFunctionData, encodeFunctionResult } from 'viem'
import {
  COPM_ADDRESS_CELO,
  MENTO_FPMM_FACTORY_CELO,
  MENTO_ROUTER_ABI,
  MENTO_ROUTER_ADDRESS_CELO,
  MENTO_VIRTUAL_POOL_FACTORY_CELO,
  MentoOracleUnavailableError,
  USDC_ADDRESS_CELO,
  USDM_ADDRESS_CELO,
  buildRoutes,
  encodeMentoSwap,
  inputTokenFor,
  minAmountOut,
  quoteMentoSwap,
} from 'src/bridgeramp/mentoRouter'
import { publicClient } from 'src/viem'

jest.mock('src/viem', () => ({
  publicClient: {
    celo: {
      call: jest.fn(),
    },
  },
}))

const call = jest.mocked(publicClient.celo.call)

function mockAmountsOut(amounts: bigint[]) {
  call.mockResolvedValueOnce({
    data: encodeFunctionResult({
      abi: MENTO_ROUTER_ABI,
      functionName: 'getAmountsOut',
      result: amounts,
    }),
  } as any)
}
const USER = '0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856'

describe('buildRoutes', () => {
  it('routes COPm to USDC through USDm, virtual pool first', () => {
    expect(buildRoutes('copmToUsdc')).toEqual([
      { from: COPM_ADDRESS_CELO, to: USDM_ADDRESS_CELO, factory: MENTO_VIRTUAL_POOL_FACTORY_CELO },
      { from: USDM_ADDRESS_CELO, to: USDC_ADDRESS_CELO, factory: MENTO_FPMM_FACTORY_CELO },
    ])
  })

  it('routes USDC to COPm through USDm, FPMM pool first', () => {
    expect(buildRoutes('usdcToCopm')).toEqual([
      { from: USDC_ADDRESS_CELO, to: USDM_ADDRESS_CELO, factory: MENTO_FPMM_FACTORY_CELO },
      { from: USDM_ADDRESS_CELO, to: COPM_ADDRESS_CELO, factory: MENTO_VIRTUAL_POOL_FACTORY_CELO },
    ])
  })
})

describe('quoteMentoSwap', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('quotes 800,000 COPm -> USDC and derives the COP/USD rate', async () => {
    // TuCOP's own liquidation of 2026-10-06: 800,000 COPm -> 247.338318 USDC.
    const amountIn = BigInt('800000000000000000000000')
    mockAmountsOut([amountIn, BigInt('247367664000000000000'), BigInt(247_338_318)])

    const quote = await quoteMentoSwap('copmToUsdc', amountIn, 1_700_000_000)

    expect(call).toHaveBeenCalledTimes(1)
    const sent = call.mock.calls[0][0] as { to: string; data: `0x${string}` }
    expect(sent.to).toBe(MENTO_ROUTER_ADDRESS_CELO)
    expect(decodeFunctionData({ abi: MENTO_ROUTER_ABI, data: sent.data })).toEqual({
      functionName: 'getAmountsOut',
      args: [amountIn, buildRoutes('copmToUsdc')],
    })
    expect(quote.amountOut).toBe(BigInt(247_338_318))
    expect(quote.amountInWhole.toFixed()).toBe('800000')
    expect(quote.amountOutWhole.toFixed()).toBe('247.338318')
    expect(quote.copPerUsd.toFixed(2)).toBe('3234.44')
    expect(quote.quotedAt).toBe(1_700_000_000)
  })

  it('quotes USDC -> COPm and derives the COP/USD rate the other way round', async () => {
    const amountIn = BigInt(100_000_000) // 100 USDC
    mockAmountsOut([amountIn, BigInt('99966762648000000000'), BigInt('319000000000000000000000')]) // 319,000 COPm

    const quote = await quoteMentoSwap('usdcToCopm', amountIn)

    expect(quote.amountOutWhole.toFixed()).toBe('319000')
    expect(quote.copPerUsd.toFixed(0)).toBe('3190')
  })

  it('surfaces an expired oracle as MentoOracleUnavailableError', async () => {
    call.mockRejectedValueOnce(
      new Error(
        'The contract function "getAmountsOut" reverted with the following reason:\nno valid median'
      )
    )

    await expect(quoteMentoSwap('copmToUsdc', BigInt(1))).rejects.toBeInstanceOf(
      MentoOracleUnavailableError
    )
  })

  it('rethrows other errors untouched', async () => {
    call.mockRejectedValueOnce(new Error('network down'))

    await expect(quoteMentoSwap('copmToUsdc', BigInt(1))).rejects.toThrow('network down')
  })

  it('rejects a non-positive amount before touching the chain', async () => {
    await expect(quoteMentoSwap('copmToUsdc', BigInt(0))).rejects.toThrow(
      'amountIn must be positive'
    )
    expect(call).not.toHaveBeenCalled()
  })
})

describe('minAmountOut', () => {
  const quote = {
    direction: 'copmToUsdc' as const,
    amountIn: BigInt(1),
    amountOut: BigInt(1_000_000),
    amountInWhole: null as any,
    amountOutWhole: null as any,
    copPerUsd: null as any,
    quotedAt: 0,
  }

  it('applies the slippage cushion in basis points', () => {
    expect(minAmountOut(quote, 50)).toBe(BigInt(995_000))
    expect(minAmountOut(quote, 0)).toBe(BigInt(1_000_000))
  })

  it('rejects an out-of-range cushion', () => {
    expect(() => minAmountOut(quote, -1)).toThrow()
    expect(() => minAmountOut(quote, 10_000)).toThrow()
  })
})

describe('encodeMentoSwap', () => {
  it('encodes swapExactTokensForTokens against the Router with the two-hop route', () => {
    const { to, data } = encodeMentoSwap({
      direction: 'copmToUsdc',
      amountIn: BigInt(5),
      amountOutMin: BigInt(4),
      recipient: USER,
      deadline: BigInt(1_800_000_000),
    })

    expect(to).toBe(MENTO_ROUTER_ADDRESS_CELO)
    const decoded = decodeFunctionData({ abi: MENTO_ROUTER_ABI, data })
    expect(decoded.functionName).toBe('swapExactTokensForTokens')
    expect(decoded.args).toEqual([
      BigInt(5),
      BigInt(4),
      buildRoutes('copmToUsdc'),
      USER,
      BigInt(1_800_000_000),
    ])
  })
})

describe('inputTokenFor', () => {
  it('names the token the Router must be approved for', () => {
    expect(inputTokenFor('copmToUsdc')).toBe(COPM_ADDRESS_CELO)
    expect(inputTokenFor('usdcToCopm')).toBe(USDC_ADDRESS_CELO)
  })
})

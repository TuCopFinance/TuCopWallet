import {
  SWAP_UPSTREAM_TRANSIENT_ERROR,
  SquidDegradationErr,
  __TESTING__,
} from 'src/swap/useSwapQuote'
import { Field, SwapTransaction } from 'src/swap/types'
import { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import { publicClient } from 'src/viem'
import { erc20Abi } from 'viem'

const { createBaseSwapTransactions, parseSquidEnvelope, throwTransientError } = __TESTING__

jest.mock('src/viem', () => ({
  publicClient: {
    celo: {
      readContract: jest.fn(),
    },
  },
}))

const readContract = publicClient.celo.readContract as jest.Mock

const walletAddress = '0x0000000000000000000000000000000000000abc' as const
const allowanceTarget = '0x0000000000000000000000000000000000000123' as const

const usdt: TokenBalance = {
  address: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
  tokenId: 'celo-mainnet:0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
  networkId: NetworkId['celo-mainnet'],
  symbol: 'USDT',
  name: 'Tether USD',
  decimals: 6,
  balance: '10' as any,
  priceUsd: '1' as any,
  imageUrl: '',
  priceFetchedAt: Date.now(),
} as unknown as TokenBalance

function captureThrown(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (e) {
    return e
  }
}

function buildTx(overrides: Partial<SwapTransaction> = {}): SwapTransaction {
  return {
    swapType: 'same-chain',
    chainId: 42220,
    price: '0.9946',
    guaranteedPrice: '0.9936',
    appFeePercentageIncludedInPrice: undefined,
    sellTokenAddress: usdt.address!,
    buyTokenAddress: '0x765de816845861e75a25fca122bb6898b8b1282a',
    sellAmount: '1000000',
    buyAmount: '994884',
    allowanceTarget,
    from: walletAddress,
    to: allowanceTarget,
    value: '0',
    data: '0xdeadbeef',
    gas: '300000',
    estimatedGasUse: '200000',
    estimatedPriceImpact: '0.05',
    ...overrides,
  } as SwapTransaction
}

describe('createBaseSwapTransactions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    readContract.mockResolvedValue(BigInt(0))
  })

  it('uses worstCaseSellAmount for the ERC20 approve (sell-mode, same decimals)', async () => {
    const tx = buildTx({ sellAmount: '1000000', buyAmount: '994884' })
    const { baseTransactions, amountToApprove } = await createBaseSwapTransactions(
      usdt,
      Field.FROM,
      tx,
      walletAddress,
      '1000000'
    )
    expect(amountToApprove).toBe(BigInt('1000000'))
    expect(baseTransactions).toHaveLength(2)
    const approveArgs = readContract.mock.calls[0][0]
    expect(approveArgs.functionName).toBe('allowance')
    expect(approveArgs.abi).toBe(erc20Abi)
  })

  it('uses worstCaseSellAmount for the approve (buy-mode, cross-decimal USDT->USDm)', async () => {
    const tx = buildTx({
      sellAmount: '1000000',
      buyAmount: '994651273537162824',
      guaranteedPrice: '0.9935',
    })
    const { amountToApprove } = await createBaseSwapTransactions(
      usdt,
      Field.TO,
      tx,
      walletAddress,
      '1000000'
    )
    expect(amountToApprove).toBe(BigInt('1000000'))
  })

  it('uses worstCaseSellAmount for the approve (buy-mode, cross-decimal USDT->COPm)', async () => {
    const tx = buildTx({
      sellAmount: '1000000',
      buyAmount: '4000000000000000000000',
      guaranteedPrice: '4000',
      buyTokenAddress: '0x8a567e2ae79ca692bd748ab832081c45de4041ea',
    })
    const { amountToApprove } = await createBaseSwapTransactions(
      usdt,
      Field.TO,
      tx,
      walletAddress,
      '1000000'
    )
    expect(amountToApprove).toBe(BigInt('1000000'))
  })

  it('skips the approve tx when allowance already covers worstCaseSellAmount', async () => {
    readContract.mockResolvedValue(BigInt('2000000'))
    const tx = buildTx({ sellAmount: '1000000' })
    const { baseTransactions } = await createBaseSwapTransactions(
      usdt,
      Field.FROM,
      tx,
      walletAddress,
      '1000000'
    )
    expect(baseTransactions).toHaveLength(1)
    expect(baseTransactions[0].data).toBe('0xdeadbeef')
  })
})

describe('parseSquidEnvelope', () => {
  it('parses the enriched squid_unavailable envelope', () => {
    const body = JSON.stringify({
      error: 'squid_unavailable',
      message: 'squid upstream unavailable',
      route: 'USDC->COPm',
      fallback_hint: 'USDT',
      retry_after_seconds: null,
    })
    const parsed = parseSquidEnvelope(body)
    expect(parsed).toEqual({
      error: 'squid_unavailable',
      message: 'squid upstream unavailable',
      route: 'USDC->COPm',
      fallback_hint: 'USDT',
      retry_after_seconds: null,
    })
  })

  it('parses the enriched squid_rate_limited envelope with retry_after_seconds', () => {
    const body = JSON.stringify({
      error: 'squid_rate_limited',
      message: 'rate limited by squid, retry',
      route: 'USDm->COPm',
      fallback_hint: 'USDT',
      retry_after_seconds: 7,
    })
    const parsed = parseSquidEnvelope(body)
    expect(parsed?.error).toBe('squid_rate_limited')
    expect(parsed?.retry_after_seconds).toBe(7)
    expect(parsed?.fallback_hint).toBe('USDT')
  })

  it('returns null for the LEGACY 502 body (no envelope)', () => {
    // Older backend versions + non-Squid-derived 5xx return a plain shape.
    // The parser must NOT hard-fail — caller falls through to generic
    // SWAP_UPSTREAM_TRANSIENT handling in that case.
    const body = JSON.stringify({ error: 'squid upstream unavailable' })
    expect(parseSquidEnvelope(body)).toBeNull()
  })

  it('returns null for non-JSON body', () => {
    expect(parseSquidEnvelope('<html>bad gateway</html>')).toBeNull()
  })

  it('returns null for JSON without the discriminated error field', () => {
    expect(parseSquidEnvelope(JSON.stringify({ foo: 'bar' }))).toBeNull()
  })
})

describe('throwTransientError', () => {
  it('throws SquidDegradationErr when the body is an enriched envelope', () => {
    const body = JSON.stringify({
      error: 'squid_unavailable',
      message: 'squid upstream unavailable',
      route: 'USDC->COPm',
      fallback_hint: 'USDT',
      retry_after_seconds: null,
    })
    const captured = captureThrown(() => throwTransientError(502, body))
    expect(captured).toBeInstanceOf(SquidDegradationErr)
    const err = captured as SquidDegradationErr
    expect(err.status).toBe(502)
    expect(err.envelope.error).toBe('squid_unavailable')
    expect(err.envelope.fallback_hint).toBe('USDT')
    // Preserves the legacy SWAP_UPSTREAM_TRANSIENT:{status}:{body} shape
    // in message so existing pattern-matchers keep working.
    expect(err.message).toContain(`${SWAP_UPSTREAM_TRANSIENT_ERROR}:502:`)
  })

  it('throws a plain Error with the legacy prefix for a legacy 502 body', () => {
    const body = JSON.stringify({ error: 'squid upstream unavailable' })
    const captured = captureThrown(() => throwTransientError(502, body))
    expect(captured).not.toBeInstanceOf(SquidDegradationErr)
    expect((captured as Error).message).toContain(`${SWAP_UPSTREAM_TRANSIENT_ERROR}:502:`)
  })

  it('propagates retry_after_seconds on rate-limited envelopes', () => {
    const body = JSON.stringify({
      error: 'squid_rate_limited',
      message: 'rate limited by squid, retry',
      route: 'USDm->COPm',
      fallback_hint: 'USDT',
      retry_after_seconds: 7,
    })
    const captured = captureThrown(() => throwTransientError(429, body))
    expect(captured).toBeInstanceOf(SquidDegradationErr)
    const err = captured as SquidDegradationErr
    expect(err.status).toBe(429)
    expect(err.envelope.error).toBe('squid_rate_limited')
    // TS narrows retry_after_seconds to number|null on the rate-limited
    // branch. Since we asserted `error` above, the cast is safe.
    const rateLimited = err.envelope as Extract<
      typeof err.envelope,
      { error: 'squid_rate_limited' }
    >
    expect(rateLimited.retry_after_seconds).toBe(7)
  })
})

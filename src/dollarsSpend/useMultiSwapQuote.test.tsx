import { renderHook, waitFor } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import React from 'react'
import { Provider } from 'react-redux'
import { useMultiSwapQuote } from 'src/dollarsSpend/useMultiSwapQuote'
import { SpendStep } from 'src/dollarsSpend/types'
import { createMockStore } from 'test/utils'

jest.mock('src/swap/useSwapQuote', () => ({
  ...jest.requireActual('src/swap/useSwapQuote'),
  fetchSwapQuote: jest.fn(),
}))

const { fetchSwapQuote } = jest.requireMock('src/swap/useSwapQuote')

const stepUsat: SpendStep = {
  tokenId: 'celo-mainnet:usat',
  symbol: 'USAT',
  amountUsd: new BigNumber(30),
  amountTokenWhole: new BigNumber(30),
  decimals: 6,
}
const stepUsdm: SpendStep = {
  tokenId: 'celo-mainnet:usdm',
  symbol: 'USDm',
  amountUsd: new BigNumber(50),
  amountTokenWhole: new BigNumber(50),
  decimals: 18,
}

const renderWithStore = <T,>(hook: () => T) => {
  const store = createMockStore({
    web3: { account: '0x0000000000000000000000000000000000000001' },
  })
  return renderHook(hook, {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  })
}

// Tests pass `toTokenDecimals=0` so the wei->whole shift inside the hook is a
// no-op. That keeps the aggregation assertions readable (we don't have to
// pre-shift every mocked buyAmount); a dedicated test below covers the shift.
describe('useMultiSwapQuote', () => {
  beforeEach(() => {
    fetchSwapQuote.mockReset()
  })

  it('returns loading=true while quotes are fetching', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    fetchSwapQuote.mockImplementation(() => new Promise(() => {}))
    const { result } = renderWithStore(() =>
      useMultiSwapQuote([stepUsat, stepUsdm], 'celo-mainnet:copm', 0)
    )
    expect(result.current.loading).toBe(true)
  })

  it('aggregates totalInUsd and totalOutToken when all quotes resolve', async () => {
    fetchSwapQuote.mockImplementation(async (args: { fromTokenId: string }) => {
      const out = args.fromTokenId.includes('usdm') ? 204_000 : 122_400
      return {
        fromTokenId: args.fromTokenId,
        swapAmount: { FROM: new BigNumber(30), TO: new BigNumber(out) },
        price: String(out / 30),
      }
    })

    const { result } = renderWithStore(() =>
      useMultiSwapQuote([stepUsat, stepUsdm], 'celo-mainnet:copm', 0)
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.totalInUsd.toString()).toBe('80')
    expect(result.current.totalOutToken.toString()).toBe('326400')
    expect(result.current.perStepQuotes).toHaveLength(2)
    expect(result.current.error).toBeUndefined()
  })

  it('reports partial coverage when some steps fail to quote', async () => {
    // One step succeeds, one throws. Aggregator should expose the missing
    // USD via `unquotedUsd` but keep `error` undefined (recoverable state).
    fetchSwapQuote.mockImplementation(async (args: { fromTokenId: string }) => {
      if (args.fromTokenId.includes('usdm')) {
        throw new Error('Squid 500')
      }
      return {
        fromTokenId: args.fromTokenId,
        swapAmount: { FROM: new BigNumber(30), TO: new BigNumber(122_400) },
      }
    })

    const { result } = renderWithStore(() =>
      useMultiSwapQuote([stepUsat, stepUsdm], 'celo-mainnet:copm', 0)
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.perStepQuotes).toHaveLength(1)
    expect(result.current.totalOutToken.toString()).toBe('122400')
    expect(result.current.unquotedUsd.toString()).toBe(stepUsdm.amountUsd.toString())
    expect(result.current.error).toBeUndefined()
  })

  it('surfaces the error only when all quote fetches fail', async () => {
    fetchSwapQuote.mockRejectedValue(new Error('Squid 500'))

    const { result } = renderWithStore(() =>
      useMultiSwapQuote([stepUsat, stepUsdm], 'celo-mainnet:copm', 0)
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.totalOutToken.toString()).toBe('0')
    expect(result.current.unquotedUsd.toString()).toBe(
      stepUsat.amountUsd.plus(stepUsdm.amountUsd).toString()
    )
    expect(result.current.error?.message).toContain('Squid 500')
  })

  it('returns zero totals and no quotes when steps is empty', async () => {
    const { result } = renderWithStore(() => useMultiSwapQuote([], 'celo-mainnet:copm', 0))
    expect(result.current.loading).toBe(false)
    expect(result.current.totalInUsd.toString()).toBe('0')
    expect(result.current.totalOutToken.toString()).toBe('0')
    expect(result.current.perStepQuotes).toEqual([])
  })

  it('shifts wei buyAmount back to whole units using toTokenDecimals', async () => {
    // Mock returns 1e18 wei (= 1 COPm whole at 18 decimals) per step.
    fetchSwapQuote.mockImplementation(async (args: { fromTokenId: string }) => ({
      fromTokenId: args.fromTokenId,
      swapAmount: { FROM: new BigNumber(30), TO: new BigNumber('1000000000000000000') },
      price: '1',
    }))

    const { result } = renderWithStore(() =>
      useMultiSwapQuote([stepUsat, stepUsdm], 'celo-mainnet:copm', 18)
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    // 2 steps * 1 whole each = 2 whole units, not 2e18 wei.
    expect(result.current.totalOutToken.toString()).toBe('2')
  })
})

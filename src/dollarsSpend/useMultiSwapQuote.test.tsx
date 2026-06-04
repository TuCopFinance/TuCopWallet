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
}
const stepUsdm: SpendStep = {
  tokenId: 'celo-mainnet:usdm',
  symbol: 'USDm',
  amountUsd: new BigNumber(50),
  amountTokenWhole: new BigNumber(50),
}

const renderWithStore = <T,>(hook: () => T) => {
  const store = createMockStore({
    web3: { account: '0x0000000000000000000000000000000000000001' },
  })
  return renderHook(hook, {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  })
}

describe('useMultiSwapQuote', () => {
  beforeEach(() => {
    fetchSwapQuote.mockReset()
  })

  it('returns loading=true while quotes are fetching', () => {
    fetchSwapQuote.mockImplementation(() => new Promise(() => {}))
    const { result } = renderWithStore(() =>
      useMultiSwapQuote([stepUsat, stepUsdm], 'celo-mainnet:copm')
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
      useMultiSwapQuote([stepUsat, stepUsdm], 'celo-mainnet:copm')
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.totalInUsd.toString()).toBe('80')
    expect(result.current.totalOutToken.toString()).toBe('326400')
    expect(result.current.perStepQuotes).toHaveLength(2)
    expect(result.current.error).toBeUndefined()
  })

  it('surfaces an error if any quote fetch fails', async () => {
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
      useMultiSwapQuote([stepUsat, stepUsdm], 'celo-mainnet:copm')
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.message).toContain('Squid 500')
  })

  it('returns zero totals and no quotes when steps is empty', async () => {
    const { result } = renderWithStore(() => useMultiSwapQuote([], 'celo-mainnet:copm'))
    expect(result.current.loading).toBe(false)
    expect(result.current.totalInUsd.toString()).toBe('0')
    expect(result.current.totalOutToken.toString()).toBe('0')
    expect(result.current.perStepQuotes).toEqual([])
  })
})

import * as React from 'react'
import { renderHook } from '@testing-library/react-native'
import { Provider } from 'react-redux'
import { useDollarBalanceSnapshots } from 'src/dollarsSpend/useDollarBalanceSnapshots'
import { createMockStore } from 'test/utils'
import networkConfig from 'src/web3/networkConfig'

const renderWithStore = <T,>(hook: () => T, storeState: object) => {
  const store = createMockStore(storeState)
  return renderHook(hook, {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  })
}

describe('useDollarBalanceSnapshots', () => {
  it('returns one snapshot per dollar token with priceUsd and balance', () => {
    const storeState = {
      tokens: {
        tokenBalances: {
          [networkConfig.usdtTokenId]: {
            tokenId: networkConfig.usdtTokenId,
            networkId: networkConfig.defaultNetworkId,
            symbol: 'USDT',
            balance: '2',
            priceUsd: '1',
            decimals: 6,
            address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
            priceFetchedAt: Date.now(),
          },
          [networkConfig.usdcTokenId]: {
            tokenId: networkConfig.usdcTokenId,
            networkId: networkConfig.defaultNetworkId,
            symbol: 'USDC',
            balance: '1',
            priceUsd: '1',
            decimals: 6,
            address: '0xcEBA9300f2b948710d2653dD7B07f33A8B32118C',
            priceFetchedAt: Date.now(),
          },
        },
      },
    }
    const { result } = renderWithStore(useDollarBalanceSnapshots, storeState)
    const symbols = result.current.map((s) => s.symbol).sort()
    expect(symbols).toContain('USDT')
    expect(symbols).toContain('USDC')
    const usdt = result.current.find((s) => s.symbol === 'USDT')
    expect(usdt?.balance.toString()).toBe('2')
    expect(usdt?.priceUsd.toString()).toBe('1')
  })

  it('returns empty array when no dollar tokens have positive balance', () => {
    const { result } = renderWithStore(useDollarBalanceSnapshots, {
      tokens: { tokenBalances: {} },
    })
    expect(result.current).toEqual([])
  })

  it('skips dollar tokens with null priceUsd', () => {
    const storeState = {
      tokens: {
        tokenBalances: {
          [networkConfig.usdtTokenId]: {
            tokenId: networkConfig.usdtTokenId,
            networkId: networkConfig.defaultNetworkId,
            symbol: 'USDT',
            balance: '2',
            priceUsd: null,
            decimals: 6,
            address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
            priceFetchedAt: Date.now(),
          },
        },
      },
    }
    const { result } = renderWithStore(useDollarBalanceSnapshots, storeState)
    expect(result.current).toEqual([])
  })
})

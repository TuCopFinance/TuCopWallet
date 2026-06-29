import { render } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import * as localCurrencyHooks from 'src/localCurrency/hooks'
import { NetworkId } from 'src/transactions/types'
import { Currency } from 'src/utils/currencies'
import { MoneyAmount } from 'src/utils/moneyAmount'
import { createMockStore } from 'test/utils'

const useLocalCurrencyToShowSpy = jest.spyOn(localCurrencyHooks, 'useLocalCurrencyToShow')

function TestComponent({ amount }: { amount: MoneyAmount }) {
  localCurrencyHooks.useLocalCurrencyToShow(amount)

  return null
}

function createStore(usdToLocalRate: string | null = '2') {
  return createMockStore({
    tokens: {
      tokenBalances: {
        'celo-mainnet:0xcUSD': {
          networkId: NetworkId['celo-mainnet'],
          tokenId: 'celo-mainnet:0xcUSD',
          address: '0xcUSD',
          symbol: 'cUSD',
          balance: '0',
          priceUsd: '1',
          priceFetchedAt: Date.now(),
        },
        'celo-mainnet:native': {
          networkId: NetworkId['celo-mainnet'],
          tokenId: 'celo-mainnet:native',
          address: '0xCELO',
          symbol: 'CELO',
          balance: '0',
          priceUsd: '5',
          priceFetchedAt: Date.now(),
        },
        'celo-mainnet:0xT1': {
          networkId: NetworkId['celo-mainnet'],
          tokenId: 'celo-mainnet:0xT1',
          address: '0xT1',
          symbol: 'T1',
          balance: '0',
          priceUsd: '5',
          priceFetchedAt: Date.now(),
        },
        'celo-mainnet:0xT2': {
          networkId: NetworkId['celo-mainnet'],
          tokenId: 'celo-mainnet:0xT2',
          address: '0xT2',
          symbol: 'T2',
          priceUsd: '5',
          balance: null,
          priceFetchedAt: Date.now(),
        },
      },
    },
    localCurrency: {
      usdToLocalRate,
    },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe(localCurrencyHooks.useLocalCurrencyToShow, () => {
  it('returns the expected values when the currency is known', async () => {
    render(
      <Provider store={createStore()}>
        <TestComponent amount={{ value: 15, currencyCode: 'cUSD' }} />
      </Provider>
    )

    expect(useLocalCurrencyToShowSpy).toHaveReturnedTimes(1)
    expect(useLocalCurrencyToShowSpy).toHaveReturnedWith({
      amountCurrency: 'cUSD',
      localCurrencyCode: 'COP',
      localCurrencyExchangeRate: '2',
    })
  })

  it('returns the expected values when the currency is CELO', async () => {
    render(
      <Provider store={createStore()}>
        <TestComponent amount={{ value: 15, currencyCode: Currency.Celo }} />
      </Provider>
    )

    expect(useLocalCurrencyToShowSpy).toHaveReturnedTimes(1)
    expect(useLocalCurrencyToShowSpy).toHaveReturnedWith({
      amountCurrency: 'CELO',
      localCurrencyCode: 'COP',
      localCurrencyExchangeRate: '10',
    })
  })

  it('returns the expected values when the currency is unknown', async () => {
    render(
      <Provider store={createStore()}>
        <TestComponent amount={{ value: 15, currencyCode: 'cSomething' }} />
      </Provider>
    )

    expect(useLocalCurrencyToShowSpy).toHaveReturnedTimes(1)
    expect(useLocalCurrencyToShowSpy).toHaveReturnedWith({
      amountCurrency: 'cSomething',
      localCurrencyCode: 'COP',
      localCurrencyExchangeRate: null,
    })
  })

  it('returns the expected values when the token is known', async () => {
    render(
      <Provider store={createStore()}>
        <TestComponent amount={{ value: 15, currencyCode: 'T1' }} />
      </Provider>
    )

    expect(useLocalCurrencyToShowSpy).toHaveReturnedTimes(1)
    expect(useLocalCurrencyToShowSpy).toHaveReturnedWith({
      amountCurrency: 'T1',
      localCurrencyCode: 'COP',
      localCurrencyExchangeRate: '10',
    })
  })

  it('returns the expected values when the token is unknown', async () => {
    render(
      <Provider store={createStore()}>
        <TestComponent amount={{ value: 15, currencyCode: 'SOMETHING' }} />
      </Provider>
    )

    expect(useLocalCurrencyToShowSpy).toHaveReturnedTimes(1)
    expect(useLocalCurrencyToShowSpy).toHaveReturnedWith({
      amountCurrency: 'SOMETHING',
      localCurrencyCode: 'COP',
      localCurrencyExchangeRate: null,
    })
  })
})

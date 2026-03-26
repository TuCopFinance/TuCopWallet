import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import GetStarted from 'src/home/GetStarted'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { NetworkId } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import { createMockStore } from 'test/utils'

jest.mock('src/web3/networkConfig', () => {
  const originalModule = jest.requireActual('src/web3/networkConfig')
  return {
    ...originalModule,
    __esModule: true,
    default: {
      ...originalModule.default,
      defaultNetworkId: 'celo-sepolia',
    },
  }
})

const copmTokenId = networkConfig.copmTokenId

const mockStoreWithCOPm = createMockStore({
  tokens: {
    tokenBalances: {
      [copmTokenId]: {
        name: 'COPm',
        networkId: NetworkId['celo-sepolia'],
        tokenId: copmTokenId,
        address: copmTokenId.split(':')[1],
        symbol: 'COPm',
        decimals: 18,
        balance: '0',
        priceUsd: '0.00025',
        priceFetchedAt: Date.now(),
        isCashInEligible: true,
      },
    },
  },
})

describe('GetStarted', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should display the correct text', () => {
    const { getByText } = render(
      <Provider store={mockStoreWithCOPm}>
        <GetStarted />
      </Provider>
    )

    expect(getByText('getStartedActivity.title, {"tokenSymbol":"COPm"}')).toBeTruthy()
    expect(getByText('getStartedActivity.cta, {"tokenSymbol":"COPm"}')).toBeTruthy()
  })

  it('should trigger button tap analytics event', () => {
    const { getByTestId } = render(
      <Provider store={mockStoreWithCOPm}>
        <GetStarted />
      </Provider>
    )

    fireEvent.press(getByTestId('GetStarted/cta'))
    expect(AppAnalytics.track).toHaveBeenCalledWith(
      FiatExchangeEvents.cico_add_get_started_selected
    )
    expect(navigate).toHaveBeenCalledWith(Screens.FiatExchangeAmount, {
      flow: 'CashIn',
      tokenId: copmTokenId,
      tokenSymbol: 'COPm',
    })
  })
})

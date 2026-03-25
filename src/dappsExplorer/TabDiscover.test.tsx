import { render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import TabDiscover from 'src/dappsExplorer/TabDiscover'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { NetworkId } from 'src/transactions/types'
import MockedNavigator from 'test/MockedNavigator'
import { createMockStore } from 'test/utils'
import { mockAaveArbUsdcAddress, mockAaveArbUsdcTokenId, mockEarnPositions } from 'test/values'

jest.mock('src/analytics/AppAnalytics')
jest.mock('src/statsig', () => ({
  ...jest.requireActual('src/statsig/__mocks__/index'),
  getExperimentParams: jest.fn(() => ({
    dappsFilterEnabled: true,
    dappsSearchEnabled: true,
  })),
  getFeatureGate: jest.fn(),
}))

const defaultStore = createMockStore({
  dapps: { dappListApiUrl: 'http://url.com', dappsList: [], dappsCategories: [] },
})

describe('TabDiscover', () => {
  beforeEach(() => {
    defaultStore.clearActions()
    jest.clearAllMocks()
    jest.mocked(getFeatureGate).mockReturnValue(false)
  })

  it('renders the discover screen', () => {
    const { getByTestId } = render(
      <Provider store={defaultStore}>
        <MockedNavigator component={TabDiscover} />
      </Provider>
    )

    expect(getByTestId('DAppsExplorerScreen')).toBeTruthy()
    expect(getByTestId('DiscoverScrollView')).toBeTruthy()
  })

  describe('earn', () => {
    it('does not display earn cta or active pool if feature gate is false', () => {
      const { queryByTestId } = render(
        <Provider store={defaultStore}>
          <MockedNavigator component={TabDiscover} />
        </Provider>
      )

      expect(queryByTestId('EarnCta')).toBeFalsy()
      expect(queryByTestId('EarnActivePool')).toBeFalsy()
    })

    it('displays EarnEntrypoint', () => {
      jest
        .mocked(getFeatureGate)
        .mockImplementation(
          (featureGateName) => featureGateName === StatsigFeatureGates.SHOW_POSITIONS
        )
      const store = createMockStore({
        dapps: { dappListApiUrl: 'http://url.com', dappsList: [], dappsCategories: [] },
        tokens: {
          tokenBalances: {
            [mockAaveArbUsdcTokenId]: {
              networkId: NetworkId['arbitrum-sepolia'],
              address: mockAaveArbUsdcAddress,
              tokenId: mockAaveArbUsdcTokenId,
              symbol: 'aArbSepUSDC',
              priceUsd: '1',
              balance: '10',
              priceFetchedAt: Date.now(),
            },
          },
        },
        positions: {
          positions: [{ ...mockEarnPositions[0], balance: '10' }],
          earnPositionIds: ['arbitrum-sepolia:0x460b97bd498e1157530aeb3086301d5225b91216'],
        },
      })

      const { getByTestId } = render(
        <Provider store={store}>
          <MockedNavigator component={TabDiscover} />
        </Provider>
      )

      expect(getByTestId('EarnEntrypoint')).toBeTruthy()
    })
  })
})

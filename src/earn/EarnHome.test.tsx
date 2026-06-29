import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { EarnEvents } from 'src/analytics/Events'
import EarnHome from 'src/earn/EarnHome'
import { Status } from 'src/earn/slice'
import { EarnTabType } from 'src/earn/types'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { NetworkId } from 'src/transactions/types'
import { ONE_DAY_IN_MILLIS } from 'src/utils/time'
import MockedNavigator from 'test/MockedNavigator'
import { createMockStore } from 'test/utils'
import { mockCusdAddress, mockCusdTokenId, mockEarnPositions, mockTokenBalances } from 'test/values'

jest.mock('src/statsig')

function getStore(
  mockPoolBalance: string = '0',
  mockStatus: Status = 'success',
  mockPositionsFetchedAt: number = Date.now(),
  emptyPositions = false
) {
  return createMockStore({
    tokens: {
      tokenBalances: {
        ...mockTokenBalances,
      },
    },
    positions: {
      positions: emptyPositions
        ? []
        : [
            {
              ...mockEarnPositions[0],
              balance: mockPoolBalance,
            },
            mockEarnPositions[1],
          ],
      earnPositionIds: emptyPositions
        ? []
        : mockEarnPositions.map((position) => position.positionId),
      status: mockStatus,
      positionsFetchedAt: mockPositionsFetchedAt,
    },
  })
}

describe('EarnHome', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(getFeatureGate)
      .mockImplementation(
        (featureGateName) => featureGateName === StatsigFeatureGates.SHOW_POSITIONS
      )
  })
  it('shows the zero state UI under my pools if the user has no pools with balance', () => {
    const { getByText } = render(
      <Provider store={getStore()}>
        <MockedNavigator
          component={EarnHome}
          params={{
            activeEarnTab: EarnTabType.MyPools,
          }}
        />
      </Provider>
    )

    expect(getByText('earnFlow.home.noPoolsTitle')).toBeTruthy()
  })
  it('shows the error state if position fetching fails', () => {
    const { getByText } = render(
      <Provider store={getStore('0', 'error', Date.now(), true)}>
        <MockedNavigator
          component={EarnHome}
          params={{
            activeEarnTab: EarnTabType.AllPools,
          }}
        />
      </Provider>
    )

    expect(getByText('earnFlow.home.errorTitle')).toBeTruthy()
    expect(getByText('earnFlow.home.errorButton')).toBeTruthy()
    fireEvent.press(getByText('earnFlow.home.errorButton'))
    expect(AppAnalytics.track).toHaveBeenCalledWith(EarnEvents.earn_home_error_try_again)
  })
  it('shows the error state if fetched positions are stale', () => {
    const { getByText } = render(
      <Provider store={getStore('0', 'error', Date.now() - ONE_DAY_IN_MILLIS, true)}>
        <MockedNavigator
          component={EarnHome}
          params={{
            activeEarnTab: EarnTabType.AllPools,
          }}
        />
      </Provider>
    )

    expect(getByText('earnFlow.home.errorTitle')).toBeTruthy()
    expect(getByText('earnFlow.home.errorButton')).toBeTruthy()
    fireEvent.press(getByText('earnFlow.home.errorButton'))
    expect(AppAnalytics.track).toHaveBeenCalledWith(EarnEvents.earn_home_error_try_again)
  })
  it('renders tab bar correctly', () => {
    const { queryAllByTestId } = render(
      <Provider store={getStore()}>
        <MockedNavigator
          component={EarnHome}
          params={{
            activeEarnTab: EarnTabType.AllPools,
          }}
        />
      </Provider>
    )

    // Celo-only app: mock positions on arbitrum/ethereum are filtered out
    // Tab bar should still render
    const tabItems = queryAllByTestId('Earn/TabBarItem')
    expect(tabItems).toHaveLength(2)
    expect(tabItems[0]).toHaveTextContent('earnFlow.poolFilters.allPools')
    expect(tabItems[1]).toHaveTextContent('earnFlow.poolFilters.myPools')
  })

  describe('Neeru Vaults gate', () => {
    const neeruPool = {
      ...mockEarnPositions[0],
      positionId: 'celo-mainnet:0xd05cdf2dc56d97333c547519df58d56145766294:category-1',
      address: '0xd05cdf2dc56d97333c547519df58d56145766294',
      networkId: NetworkId['celo-mainnet'],
      appId: 'neeru-vaults',
      appName: 'Neeru Vaults',
      displayProps: {
        ...mockEarnPositions[0].displayProps,
        title: 'NEERU_TEST_TITLE_30D',
      },
      // EarnHome filters out pools whose tokens aren't in the user's tokenList.
      // mockEarnPositions[0] inherits arbitrum tokens, which a Celo-only app
      // strips. Pin to a Celo token present in mockTokenBalances so the gate
      // assertions actually exercise the filter.
      tokens: [
        {
          ...mockEarnPositions[0].tokens[0],
          tokenId: mockCusdTokenId,
          networkId: NetworkId['celo-mainnet'],
          address: mockCusdAddress,
        },
      ],
    }

    const storeWithNeeru = createMockStore({
      tokens: { tokenBalances: { ...mockTokenBalances } },
      positions: {
        positions: [mockEarnPositions[0], neeruPool, mockEarnPositions[1]],
        earnPositionIds: [
          mockEarnPositions[0].positionId,
          neeruPool.positionId,
          mockEarnPositions[1].positionId,
        ],
        status: 'success' as Status,
        positionsFetchedAt: Date.now(),
      },
    })

    const neeruPoolCardTestId = `PoolCard/${neeruPool.positionId}`

    it('hides neeru-vaults pools when SHOW_NEERU_VAULTS gate is off (default)', () => {
      // beforeEach already mocks gate so only SHOW_POSITIONS is true.
      const { queryByTestId } = render(
        <Provider store={storeWithNeeru}>
          <MockedNavigator component={EarnHome} params={{ activeEarnTab: EarnTabType.AllPools }} />
        </Provider>
      )
      expect(queryByTestId(neeruPoolCardTestId)).toBeNull()
    })

    it('shows neeru-vaults pools when SHOW_NEERU_VAULTS gate is on', () => {
      jest
        .mocked(getFeatureGate)
        .mockImplementation(
          (g) =>
            g === StatsigFeatureGates.SHOW_POSITIONS || g === StatsigFeatureGates.SHOW_NEERU_VAULTS
        )
      const { getByTestId } = render(
        <Provider store={storeWithNeeru}>
          <MockedNavigator component={EarnHome} params={{ activeEarnTab: EarnTabType.AllPools }} />
        </Provider>
      )
      expect(getByTestId(neeruPoolCardTestId)).toBeTruthy()
    })
  })
})

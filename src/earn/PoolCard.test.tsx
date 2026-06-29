import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { EarnEvents } from 'src/analytics/Events'
import PoolCard from 'src/earn/PoolCard'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { NetworkId } from 'src/transactions/types'
import { createMockStore } from 'test/utils'
import {
  mockArbEthTokenId,
  mockArbUsdcTokenId,
  mockEarnPositions,
  mockTokenBalances,
} from 'test/values'

jest.mock('src/navigator/NavigationService', () => ({ navigate: jest.fn() }))

describe('PoolCard', () => {
  it('renders correctly', () => {
    const { getByText } = render(
      <Provider store={createMockStore({ tokens: { tokenBalances: mockTokenBalances } })}>
        <PoolCard
          pool={{
            ...mockEarnPositions[0],
            tokens: [
              // mocking multiple tokens
              ...mockEarnPositions[0].tokens,
              {
                tokenId: mockArbEthTokenId,
                networkId: NetworkId['arbitrum-one'],
                address: 'native',
                symbol: 'ETH',
                decimals: 6,
                priceUsd: '2000',
                type: 'base-token',
                balance: '0',
              },
            ],
          }}
        />
      </Provider>
    )

    expect(getByText('USDC / ETH')).toBeTruthy()
    expect(getByText('earnFlow.poolCard.onNetwork, {"networkName":"Arbitrum One"}')).toBeTruthy()
    expect(getByText('earnFlow.poolCard.percentage, {"percentage":"1.92"}')).toBeTruthy()
    expect(getByText('COP$1,808,800.00')).toBeTruthy()
  })

  it('correct behavior when tapping pool card', () => {
    const { getByTestId } = render(
      <Provider store={createMockStore({ tokens: { tokenBalances: mockTokenBalances } })}>
        <PoolCard pool={{ ...mockEarnPositions[0], balance: '10' }} />
      </Provider>
    )

    expect(getByTestId('PoolCard')).toBeTruthy()
    fireEvent.press(getByTestId('PoolCard'))
    // TODO(ACT-1321): Assert that it correctly navigates to PoolDetails screen
    expect(AppAnalytics.track).toHaveBeenCalledWith(EarnEvents.earn_pool_card_press, {
      poolId: 'arbitrum-one:0x460b97bd498e1157530aeb3086301d5225b91216',
      networkId: NetworkId['arbitrum-one'],
      depositTokenId: mockArbUsdcTokenId,
      poolAmount: '10',
      providerId: 'aave',
    })
  })

  describe('navigation branching', () => {
    beforeEach(() => jest.clearAllMocks())

    it('routes non-Neeru pools to EarnPoolInfoScreen', () => {
      const pool = { ...mockEarnPositions[0], appId: 'allbridge' }
      const { getByTestId } = render(
        <Provider store={createMockStore({ tokens: { tokenBalances: mockTokenBalances } })}>
          <PoolCard pool={pool} testID="PoolCard.allbridge" />
        </Provider>
      )
      fireEvent.press(getByTestId('PoolCard.allbridge'))
      expect(navigate).toHaveBeenCalledWith(Screens.EarnPoolInfoScreen, { pool })
    })

    it('routes Neeru pools to NeeruVaultDetail', () => {
      const pool = { ...mockEarnPositions[0], appId: 'neeru-vaults' }
      const { getByTestId } = render(
        <Provider store={createMockStore({ tokens: { tokenBalances: mockTokenBalances } })}>
          <PoolCard pool={pool} testID="PoolCard.neeru" />
        </Provider>
      )
      fireEvent.press(getByTestId('PoolCard.neeru'))
      expect(navigate).toHaveBeenCalledWith(Screens.NeeruVaultDetail, { pool })
    })
  })
})

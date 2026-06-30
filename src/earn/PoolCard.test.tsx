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

    // USDC -> "Dólares" via getTokenDisplayName per wallet manual; ETH stays as-is
    expect(getByText('Dólares / ETH')).toBeTruthy()
    expect(getByText('earnFlow.poolCard.percentage, {"percentage":"1.92"}')).toBeTruthy()
    expect(getByText('COP$1,808,800.00')).toBeTruthy()
  })

  describe('card title display', () => {
    it('renders Neeru pool title as the token display name with tranche subtitle below', () => {
      const neeruPool = {
        ...mockEarnPositions[0],
        appId: 'neeru-vaults',
        positionId: 'celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:tranche-1',
      }
      const { getByText, queryByText } = render(
        <Provider store={createMockStore({ tokens: { tokenBalances: mockTokenBalances } })}>
          <PoolCard pool={neeruPool} testID="PoolCard.neeru-30d" />
        </Provider>
      )
      // Title is the token display name (USDC -> Dólares from getTokenDisplayName)
      expect(getByText('Dólares')).toBeTruthy()
      // Subtitle is the tranche-specific i18n key (mock returns key)
      expect(getByText('neeruVaults.cardSubtitle.thirtyDays')).toBeTruthy()
      // Raw token symbols never shown
      expect(queryByText('USDC')).toBeNull()
      expect(queryByText('cCOP')).toBeNull()
    })

    it('does not render a subtitle for non-Neeru pools', () => {
      const allbridgePool = { ...mockEarnPositions[0], appId: 'allbridge' }
      const { queryByText } = render(
        <Provider store={createMockStore({ tokens: { tokenBalances: mockTokenBalances } })}>
          <PoolCard pool={allbridgePool} testID="PoolCard.allbridge" />
        </Provider>
      )
      expect(queryByText('neeruVaults.cardSubtitle.thirtyDays')).toBeNull()
      expect(queryByText('neeruVaults.cardSubtitle.flexible')).toBeNull()
    })

    it('maps token symbol via getTokenDisplayName for non-Neeru pools (cCOP -> Pesos)', () => {
      // Simulate a non-Neeru pool whose token symbol is the legacy cCOP
      const poolWithLegacySymbol = {
        ...mockEarnPositions[0],
        appId: 'allbridge',
        tokens: [
          {
            ...mockEarnPositions[0].tokens[0],
            symbol: 'cCOP',
          },
        ],
      }
      // To make tokensByIdSelector resolve, override the token balance with cCOP symbol
      const storeWithCCop = createMockStore({
        tokens: {
          tokenBalances: {
            ...mockTokenBalances,
            [poolWithLegacySymbol.tokens[0].tokenId]: {
              ...mockTokenBalances[mockArbUsdcTokenId],
              tokenId: poolWithLegacySymbol.tokens[0].tokenId,
              symbol: 'cCOP',
            },
          },
        },
      })
      const { getByText, queryByText } = render(
        <Provider store={storeWithCCop}>
          <PoolCard pool={poolWithLegacySymbol} testID="PoolCard.legacy" />
        </Provider>
      )
      expect(getByText('Pesos')).toBeTruthy()
      expect(queryByText('cCOP')).toBeNull()
    })
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

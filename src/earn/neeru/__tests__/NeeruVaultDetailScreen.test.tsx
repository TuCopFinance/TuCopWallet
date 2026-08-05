import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import NeeruVaultDetailScreen from 'src/earn/neeru/NeeruVaultDetailScreen'
import { initialState as initialNeeruState } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { NetworkId } from 'src/transactions/types'
import { createMockStore } from 'test/utils'
import { mockEarnPositions } from 'test/values'

jest.mock('src/navigator/NavigationService', () => ({ navigate: jest.fn() }))

const pool = {
  ...mockEarnPositions[0],
  appId: 'neeru-vaults',
  positionId: 'celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:category-1',
  address: '0x988af5977201a0e988f2c75ea952532f6beb5082',
  networkId: NetworkId['celo-mainnet'],
}

const positionFor = (positionId: string): NeeruIndividualPosition => ({
  positionId,
  category: 1,
  categoryLabel: '30 dias',
  amount: '10000',
  accruedInterest: '82.5',
  rateValue: '1',
  monthlyRatePercentage: 1.0,
  startTs: 0,
  endTs: 1702592000,
  depositBlock: 0,
  depositTxHash: '0x' + 'a'.repeat(64),
  renewedFromPositionId: null,
  currentPayoutIfClosed: {
    amount: '10000',
    interest: '82.5',
    penaltyBps: 2000,
    interestAfterPenalty: '66',
    total: '10066',
    isEarly: true,
  },
})

describe('NeeruVaultDetailScreen', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders aggregate balance and position rows', () => {
    const store = createMockStore({
      neeru: {
        ...initialNeeruState,
        positions: [positionFor('1'), positionFor('2')],
        fetchStatus: 'success',
      },
    } as any)
    const { getByText, getAllByTestId } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    expect(getByText(/neeruVaults\.detail\.aggregateBalance/)).toBeTruthy()
    expect(getAllByTestId('NeeruPositionRow').length).toBe(2)
  })

  it('navigates to EarnEnterAmount on deposit CTA', () => {
    const store = createMockStore({
      neeru: { ...initialNeeruState, fetchStatus: 'success' },
    } as any)
    const { getByTestId } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    fireEvent.press(getByTestId('NeeruVaultDetail.DepositCta'))
    expect(navigate).toHaveBeenCalledWith(Screens.EarnEnterAmount, {
      pool,
      mode: 'deposit',
    })
  })

  it('shows rich empty state when no positions', () => {
    const store = createMockStore({
      neeru: { ...initialNeeruState, positions: [], fetchStatus: 'success' },
    } as any)
    const { getByTestId, getByText, queryByText } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    expect(getByTestId('NeeruVaultDetail.EmptyState')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.rateEyebrow')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.howItWorksHeader')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.step1')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.step2')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.step3Fixed')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.trustNote')).toBeTruthy()
    expect(queryByText('neeruVaults.detail.aggregateBalance')).toBeNull()
    expect(queryByText('neeruVaults.detail.noPositions')).toBeNull()
  })

  it('does not render the legacy transparency block', () => {
    const store = createMockStore({
      neeru: { ...initialNeeruState, fetchStatus: 'success' },
    } as any)
    const { queryByText } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    expect(queryByText('neeruVaults.detail.transparency.title')).toBeNull()
    expect(queryByText(/0x988af5977201a0e988f2c75ea952532f6beb5082/i)).toBeNull()
  })

  it('navigates to NeeruManagePosition when a position row Manage is pressed', () => {
    const p = positionFor('555')
    const store = createMockStore({
      neeru: {
        ...initialNeeruState,
        positions: [p],
        fetchStatus: 'success',
      },
    } as any)
    const { getByTestId } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    fireEvent.press(getByTestId('NeeruPositionRow.Manage.555'))
    expect(navigate).toHaveBeenCalledWith(Screens.NeeruManagePosition, {
      position: p,
      pool,
    })
  })
})

import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import NeeruVaultDetailScreen from 'src/earn/neeru/NeeruVaultDetailScreen'
import { NEERU_LOW_POOL_ERROR } from 'src/earn/neeru/saga'
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
    // Rich card is rendered
    expect(getByTestId('NeeruVaultDetail.EmptyState')).toBeTruthy()
    // Rate hero, how-it-works header, and 3 steps are visible
    expect(getByText('neeruVaults.detail.emptyState.rateEyebrow')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.howItWorksHeader')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.step1')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.step2')).toBeTruthy()
    // Mock pool is category 1 (30 dias fixed tranche), so the withdraw step
    // is the fixed variant (mentions the lock period + early withdraw fee).
    expect(getByText('neeruVaults.detail.emptyState.step3Fixed')).toBeTruthy()
    expect(getByText('neeruVaults.detail.emptyState.trustNote')).toBeTruthy()
    // Legacy sparse "Total en X: 0.00 Pesos" and one-line "no tienes depositos"
    // are suppressed in the empty state (they read as if the page were broken)
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

  it('opens NeeruCloseSheet when a position row Manage is pressed', () => {
    const store = createMockStore({
      neeru: {
        ...initialNeeruState,
        positions: [positionFor('555')],
        fetchStatus: 'success',
      },
    } as any)
    const { getByTestId, queryByTestId } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    expect(queryByTestId('NeeruCloseSheet')).toBeNull()
    fireEvent.press(getByTestId('NeeruPositionRow.Manage.555'))
    expect(getByTestId('NeeruCloseSheet')).toBeTruthy()
  })

  it('opens NeeruEmergencyCloseSheet proactively when amount-only option is tapped', () => {
    const store = createMockStore({
      neeru: {
        ...initialNeeruState,
        positions: [positionFor('321')],
        fetchStatus: 'success',
      },
    } as any)
    const { getByTestId, queryByTestId } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    fireEvent.press(getByTestId('NeeruPositionRow.Manage.321'))
    expect(getByTestId('NeeruCloseSheet')).toBeTruthy()
    fireEvent.press(getByTestId('NeeruCloseSheet.AmountOnly'))
    expect(queryByTestId('NeeruCloseSheet')).toBeNull()
    expect(getByTestId('NeeruEmergencyCloseSheet')).toBeTruthy()
  })

  it('opens NeeruEmergencyCloseSheet when close fails with the low-pool error signal', () => {
    // Start with idle state so user can tap Manage to seed lastSelectedRef
    const store = createMockStore({
      neeru: {
        ...initialNeeruState,
        positions: [positionFor('789')],
        fetchStatus: 'success',
      },
    } as any)
    const { getByTestId, queryByTestId, rerender } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    // User taps Manage, seeding lastSelectedRef + opening close sheet
    fireEvent.press(getByTestId('NeeruPositionRow.Manage.789'))
    expect(getByTestId('NeeruCloseSheet')).toBeTruthy()

    // Backend / chain now reports the low-pool selector; wallet-side slice
    // surfaces it via the opaque NEERU_LOW_POOL_ERROR signal.
    const failedStore = createMockStore({
      neeru: {
        ...initialNeeruState,
        positions: [positionFor('789')],
        fetchStatus: 'success',
        closeStatus: 'error',
        lastError: NEERU_LOW_POOL_ERROR,
      },
    } as any)
    rerender(
      <Provider store={failedStore}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )

    expect(queryByTestId('NeeruEmergencyCloseSheet')).toBeTruthy()
  })
})

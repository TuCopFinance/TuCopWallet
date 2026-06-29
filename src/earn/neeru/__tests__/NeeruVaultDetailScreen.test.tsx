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
  positionId: 'celo-mainnet:0xd05cdf2dc56d97333c547519df58d56145766294:tranche-1',
  address: '0xd05cdf2dc56d97333c547519df58d56145766294',
  networkId: NetworkId['celo-mainnet'],
}

const positionFor = (positionId: string): NeeruIndividualPosition => ({
  positionId,
  tranche: 1,
  trancheLabel: '30 dias',
  principal: '10000',
  accruedInterest: '82.5',
  dailyRateRay: '1',
  monthlyRatePercentage: 1.0,
  startTs: 0,
  maturityTs: 1702592000,
  depositBlock: 0,
  depositTxHash: '0x' + 'a'.repeat(64),
  renewedFromPositionId: null,
  currentPayoutIfClosed: {
    principal: '10000',
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

  it('shows empty state when no positions', () => {
    const store = createMockStore({
      neeru: { ...initialNeeruState, positions: [], fetchStatus: 'success' },
    } as any)
    const { getByText } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    expect(getByText('neeruVaults.detail.noPositions')).toBeTruthy()
  })

  it('renders transparency disclaimer block with contract address', () => {
    const store = createMockStore({
      neeru: { ...initialNeeruState, fetchStatus: 'success' },
    } as any)
    const { getByText } = render(
      <Provider store={store}>
        <NeeruVaultDetailScreen route={{ params: { pool } } as any} navigation={{} as any} />
      </Provider>
    )
    expect(getByText('neeruVaults.detail.transparency.title')).toBeTruthy()
    // Full contract address must NOT be truncated
    expect(getByText(/0xD05CDF2DC56D97333c547519dF58D56145766294/)).toBeTruthy()
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
})

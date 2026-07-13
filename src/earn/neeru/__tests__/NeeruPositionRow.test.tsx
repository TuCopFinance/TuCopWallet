import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import { Linking } from 'react-native'
import { Provider } from 'react-redux'
import NeeruPositionRow from 'src/earn/neeru/NeeruPositionRow'
import { fetchPositionsStart, initialState as initialNeeruState } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { createMockStore } from 'test/utils'

const TX = '0x' + 'a'.repeat(64)

const pos: NeeruIndividualPosition = {
  positionId: '1234',
  category: 1,
  categoryLabel: '30 dias',
  amount: '10000',
  accruedInterest: '82.5',
  rateValue: '0',
  monthlyRatePercentage: 1.0,
  startTs: 1700000000,
  endTs: 1702592000,
  depositBlock: 0,
  depositTxHash: TX,
  renewedFromPositionId: null,
  currentPayoutIfClosed: {
    amount: '10000',
    interest: '82.5',
    penaltyBps: 2000,
    interestAfterPenalty: '66',
    total: '10066',
    isEarly: true,
  },
}

const renderRow = (position: NeeruIndividualPosition, onManagePress = jest.fn()) => {
  const store = createMockStore({ neeru: initialNeeruState } as any)
  const utils = render(
    <Provider store={store}>
      <NeeruPositionRow position={position} onManagePress={onManagePress} />
    </Provider>
  )
  return { store, onManagePress, ...utils }
}

describe('NeeruPositionRow', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders amount and interest for backend positions', () => {
    const { getByText } = renderRow(pos)
    expect(getByText(/10000/)).toBeTruthy()
    expect(getByText(/82.5/)).toBeTruthy()
  })

  it('fires onManagePress when manage CTA tapped (non-optimistic)', () => {
    const { getByTestId, onManagePress } = renderRow(pos)
    fireEvent.press(getByTestId('NeeruPositionRow.Manage.1234'))
    expect(onManagePress).toHaveBeenCalledWith(pos)
  })

  it('shows the Processing badge and hides Manage when position is optimistic', () => {
    const optimistic: NeeruIndividualPosition = {
      ...pos,
      positionId: `optimistic:${TX}`,
      optimistic: true,
      staleOptimistic: false,
    }
    const { getByTestId, queryByTestId, getByText } = renderRow(optimistic)
    expect(getByTestId('NeeruPositionRow.ProcessingBadge')).toBeTruthy()
    expect(getByText('neeruVaults.positionRow.processingBadge')).toBeTruthy()
    expect(queryByTestId(`NeeruPositionRow.Manage.optimistic:${TX}`)).toBeNull()
    expect(queryByTestId(`NeeruPositionRow.Refresh.optimistic:${TX}`)).toBeNull()
    expect(queryByTestId(`NeeruPositionRow.Celoscan.optimistic:${TX}`)).toBeNull()
  })

  it('shows Refresh + Celoscan link when optimistic + stale', () => {
    const stale: NeeruIndividualPosition = {
      ...pos,
      positionId: `optimistic:${TX}`,
      optimistic: true,
      staleOptimistic: true,
    }
    const { getByTestId, queryByTestId, store } = renderRow(stale)
    expect(queryByTestId('NeeruPositionRow.ProcessingBadge')).toBeNull()
    expect(getByTestId(`NeeruPositionRow.Refresh.optimistic:${TX}`)).toBeTruthy()

    fireEvent.press(getByTestId(`NeeruPositionRow.Refresh.optimistic:${TX}`))
    expect(store.getActions()).toContainEqual(fetchPositionsStart())

    const linkingSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    fireEvent.press(getByTestId(`NeeruPositionRow.Celoscan.optimistic:${TX}`))
    expect(linkingSpy).toHaveBeenCalledWith(`https://celoscan.io/tx/${TX}`)
    linkingSpy.mockRestore()
  })
})

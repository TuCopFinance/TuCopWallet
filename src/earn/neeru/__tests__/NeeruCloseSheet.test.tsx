import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import NeeruCloseSheet from 'src/earn/neeru/NeeruCloseSheet'
import { closePositionStart, initialState as initialNeeruState } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { createMockStore } from 'test/utils'

const pos: NeeruIndividualPosition = {
  positionId: '1234',
  category: 1,
  categoryLabel: '30 dias',
  amount: '10000',
  accruedInterest: '82.5',
  rateValue: '0',
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
}

describe('NeeruCloseSheet', () => {
  it('renders payout breakdown', () => {
    const store = createMockStore({ neeru: initialNeeruState } as any)
    const { getByText } = render(
      <Provider store={store}>
        <NeeruCloseSheet position={pos} onClose={jest.fn()} />
      </Provider>
    )
    // Translation mock returns keys, so we assert on the principal/interest VALUES
    expect(getByText(/10000/)).toBeTruthy()
    expect(getByText(/82.5/)).toBeTruthy()
    expect(getByText(/10066/)).toBeTruthy()
  })

  it('dispatches closePositionStart on confirm', () => {
    const store = createMockStore({ neeru: initialNeeruState } as any)
    const spy = jest.spyOn(store, 'dispatch')
    const { getByTestId } = render(
      <Provider store={store}>
        <NeeruCloseSheet position={pos} onClose={jest.fn()} />
      </Provider>
    )
    fireEvent.press(getByTestId('NeeruCloseSheet.Confirm'))
    expect(spy).toHaveBeenCalledWith(closePositionStart({ positionId: '1234' }))
  })

  it('hides the principal-only option when no callback is provided', () => {
    const store = createMockStore({ neeru: initialNeeruState } as any)
    const { queryByTestId } = render(
      <Provider store={store}>
        <NeeruCloseSheet position={pos} onClose={jest.fn()} />
      </Provider>
    )
    expect(queryByTestId('NeeruCloseSheet.PrincipalOnly')).toBeNull()
  })

  it('exposes principal-only option that invokes the callback with the position', () => {
    const store = createMockStore({ neeru: initialNeeruState } as any)
    const onPrincipalOnlyRequested = jest.fn()
    const { getByTestId } = render(
      <Provider store={store}>
        <NeeruCloseSheet
          position={pos}
          onClose={jest.fn()}
          onPrincipalOnlyRequested={onPrincipalOnlyRequested}
        />
      </Provider>
    )
    fireEvent.press(getByTestId('NeeruCloseSheet.PrincipalOnly'))
    expect(onPrincipalOnlyRequested).toHaveBeenCalledWith(pos)
  })
})

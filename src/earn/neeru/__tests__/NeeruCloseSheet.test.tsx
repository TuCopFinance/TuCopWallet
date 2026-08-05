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
        <NeeruCloseSheet forwardedRef={React.createRef()} position={pos} onClose={jest.fn()} />
      </Provider>
    )
    // Translation mock returns keys, so we assert on the amount/interest VALUES.
    // formatValueToDisplay renders thousands separators + 2 decimals ("10,000.00").
    expect(getByText(/10,000/)).toBeTruthy()
    expect(getByText(/82\.50/)).toBeTruthy()
    expect(getByText(/10,066/)).toBeTruthy()
  })

  it('dispatches closePositionStart on confirm', () => {
    const store = createMockStore({ neeru: initialNeeruState } as any)
    const spy = jest.spyOn(store, 'dispatch')
    const { getByTestId } = render(
      <Provider store={store}>
        <NeeruCloseSheet forwardedRef={React.createRef()} position={pos} onClose={jest.fn()} />
      </Provider>
    )
    fireEvent.press(getByTestId('NeeruCloseSheet.Confirm'))
    expect(spy).toHaveBeenCalledWith(closePositionStart({ positionId: '1234' }))
  })

  it('does not expose an amount-only option (emergency flow is auto-triggered)', () => {
    const store = createMockStore({ neeru: initialNeeruState } as any)
    const { queryByTestId } = render(
      <Provider store={store}>
        <NeeruCloseSheet forwardedRef={React.createRef()} position={pos} onClose={jest.fn()} />
      </Provider>
    )
    expect(queryByTestId('NeeruCloseSheet.AmountOnly')).toBeNull()
  })

  describe('Flex under 24h warning', () => {
    const flexPosition = (startTsSecondsAgo: number): NeeruIndividualPosition => {
      const nowSecs = Math.floor(Date.now() / 1000)
      return {
        ...pos,
        category: 0,
        categoryLabel: 'Flexible',
        startTs: nowSecs - startTsSecondsAgo,
        currentPayoutIfClosed: {
          amount: '10000',
          interest: '0',
          penaltyBps: 0,
          interestAfterPenalty: '0',
          total: '10000',
          isEarly: false,
        },
      }
    }

    it('shows the warning when a Flex position is closed under 24h from deposit', () => {
      const store = createMockStore({ neeru: initialNeeruState } as any)
      const { getByTestId } = render(
        <Provider store={store}>
          <NeeruCloseSheet
            forwardedRef={React.createRef()}
            position={flexPosition(3600)}
            onClose={jest.fn()}
          />
        </Provider>
      )
      expect(getByTestId('NeeruCloseSheet.FlexUnder24hWarning')).toBeTruthy()
    })

    it('does not show the warning when a Flex position is at least 24h old', () => {
      const store = createMockStore({ neeru: initialNeeruState } as any)
      const { queryByTestId } = render(
        <Provider store={store}>
          <NeeruCloseSheet
            forwardedRef={React.createRef()}
            position={flexPosition(86400 + 60)}
            onClose={jest.fn()}
          />
        </Provider>
      )
      expect(queryByTestId('NeeruCloseSheet.FlexUnder24hWarning')).toBeNull()
    })

    it('does not show the warning for locked categories under 24h (they get earlyWarning instead)', () => {
      const store = createMockStore({ neeru: initialNeeruState } as any)
      const nowSecs = Math.floor(Date.now() / 1000)
      const lockedUnder24h: NeeruIndividualPosition = {
        ...pos,
        category: 1,
        startTs: nowSecs - 3600,
      }
      const { queryByTestId } = render(
        <Provider store={store}>
          <NeeruCloseSheet
            forwardedRef={React.createRef()}
            position={lockedUnder24h}
            onClose={jest.fn()}
          />
        </Provider>
      )
      expect(queryByTestId('NeeruCloseSheet.FlexUnder24hWarning')).toBeNull()
    })
  })
})

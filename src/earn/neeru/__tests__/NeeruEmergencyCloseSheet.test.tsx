import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import NeeruEmergencyCloseSheet from 'src/earn/neeru/NeeruEmergencyCloseSheet'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'

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

describe('NeeruEmergencyCloseSheet', () => {
  it('renders principal and interest in the explanation', () => {
    const { getByText } = render(
      <NeeruEmergencyCloseSheet position={pos} onConfirm={jest.fn()} onCancel={jest.fn()} />
    )
    expect(getByText(/10000/)).toBeTruthy()
    expect(getByText(/82.5/)).toBeTruthy()
  })

  it('requires two taps on the secondary CTA before firing onConfirm', () => {
    const onConfirm = jest.fn()
    const { getByTestId } = render(
      <NeeruEmergencyCloseSheet position={pos} onConfirm={onConfirm} onCancel={jest.fn()} />
    )
    fireEvent.press(getByTestId('NeeruEmergencyCloseSheet.Secondary'))
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.press(getByTestId('NeeruEmergencyCloseSheet.Secondary'))
    expect(onConfirm).toHaveBeenCalledWith(pos)
  })
})

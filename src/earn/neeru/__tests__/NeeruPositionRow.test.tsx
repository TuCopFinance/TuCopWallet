import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import NeeruPositionRow from 'src/earn/neeru/NeeruPositionRow'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'

const pos: NeeruIndividualPosition = {
  positionId: '1234',
  tranche: 1,
  trancheLabel: '30 dias',
  principal: '10000',
  accruedInterest: '82.5',
  dailyRateRay: '0',
  monthlyRatePercentage: 1.0,
  startTs: 1700000000,
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
}

describe('NeeruPositionRow', () => {
  it('renders principal and interest', () => {
    const { getByText } = render(<NeeruPositionRow position={pos} onManagePress={() => {}} />)
    expect(getByText(/10000/)).toBeTruthy()
    expect(getByText(/82.5/)).toBeTruthy()
  })

  it('fires onManagePress when manage CTA tapped', () => {
    const onManagePress = jest.fn()
    const { getByTestId } = render(
      <NeeruPositionRow position={pos} onManagePress={onManagePress} />
    )
    fireEvent.press(getByTestId('NeeruPositionRow.Manage.1234'))
    expect(onManagePress).toHaveBeenCalledWith(pos)
  })
})

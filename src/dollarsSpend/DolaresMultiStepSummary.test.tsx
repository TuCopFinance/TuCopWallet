import * as React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import DolaresMultiStepSummary from 'src/dollarsSpend/DolaresMultiStepSummary'
import { SpendStep } from 'src/dollarsSpend/types'

const step: SpendStep = {
  tokenId: 'celo-mainnet:usat',
  symbol: 'USAT',
  amountUsd: new BigNumber(30),
  amountTokenWhole: new BigNumber(30),
  decimals: 6,
}

describe('DolaresMultiStepSummary', () => {
  it('renders the panel container', () => {
    const { getByTestId } = render(<DolaresMultiStepSummary steps={[step]} />)
    expect(getByTestId('DolaresMultiStepSummary')).toBeTruthy()
  })

  it('starts collapsed and toggles to expanded on tap', () => {
    const { getByTestId, queryAllByText } = render(<DolaresMultiStepSummary steps={[step]} />)
    expect(queryAllByText('USAT').length).toBe(0)
    fireEvent.press(getByTestId('DolaresMultiStepSummary/Toggle'))
    expect(queryAllByText('USAT').length).toBe(1)
  })

  it('renders one row per step when expanded', () => {
    const step2: SpendStep = {
      tokenId: 'celo-mainnet:usdm',
      symbol: 'USDm',
      amountUsd: new BigNumber(50),
      amountTokenWhole: new BigNumber(50),
      decimals: 18,
    }
    const { getByTestId, queryAllByText } = render(
      <DolaresMultiStepSummary steps={[step, step2]} />
    )
    fireEvent.press(getByTestId('DolaresMultiStepSummary/Toggle'))
    expect(queryAllByText('USAT').length).toBe(1)
    expect(queryAllByText('USDm').length).toBe(1)
  })

  it('renders nothing when steps is empty', () => {
    const { queryByTestId } = render(<DolaresMultiStepSummary steps={[]} />)
    expect(queryByTestId('DolaresMultiStepSummary')).toBeNull()
  })
})

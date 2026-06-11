import * as React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import { ReactTestInstance } from 'react-test-renderer'
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
  it('renders headline with aggregate amounts', () => {
    const { getByTestId } = render(
      <DolaresMultiStepSummary
        steps={[step]}
        totalInUsd={new BigNumber(30)}
        totalOutToken={new BigNumber(122400)}
        toTokenSymbol="COPm"
      />
    )
    expect(getByTestId('DolaresMultiStepSummary')).toBeTruthy()
  })

  it('starts collapsed and toggles to expanded on tap', () => {
    const { getByTestId, queryAllByText } = render(
      <DolaresMultiStepSummary
        steps={[step]}
        totalInUsd={new BigNumber(30)}
        totalOutToken={new BigNumber(122400)}
        toTokenSymbol="COPm"
      />
    )
    // Initially collapsed: no breakdown row visible (symbol only in expanded view)
    expect(queryAllByText('USAT').length).toBe(0)
    // Tap the toggle - it renders i18n key text which we can find via testID container
    const container = getByTestId('DolaresMultiStepSummary')
    // The toggle is the second child (the Touchable wrapper); press it
    fireEvent.press(container.children[1] as ReactTestInstance)
    // Now expanded: per-step row visible
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
      <DolaresMultiStepSummary
        steps={[step, step2]}
        totalInUsd={new BigNumber(80)}
        totalOutToken={new BigNumber(326400)}
        toTokenSymbol="COPm"
      />
    )
    const container = getByTestId('DolaresMultiStepSummary')
    fireEvent.press(container.children[1] as ReactTestInstance)
    expect(queryAllByText('USAT').length).toBe(1)
    expect(queryAllByText('USDm').length).toBe(1)
  })
})

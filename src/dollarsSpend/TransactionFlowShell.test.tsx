import * as React from 'react'
import { render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import { Provider } from 'react-redux'
import TransactionFlowShell from 'src/dollarsSpend/TransactionFlowShell'
import { SpendStep } from 'src/dollarsSpend/types'
import { createMockStore } from 'test/utils'

const stepUsat: SpendStep = {
  tokenId: 'celo-mainnet:usat',
  symbol: 'USAT',
  amountUsd: new BigNumber(30),
  amountTokenWhole: new BigNumber(30),
  decimals: 6,
}
const stepUsdm: SpendStep = {
  tokenId: 'celo-mainnet:usdm',
  symbol: 'USDm',
  amountUsd: new BigNumber(50),
  amountTokenWhole: new BigNumber(50),
  decimals: 18,
}

describe('TransactionFlowShell', () => {
  it('renders nothing when no in-flight session and not transitioning', () => {
    const store = createMockStore({
      dollarsSpend: { inFlight: null, transitioning: false },
    })
    const { queryByTestId, toJSON } = render(
      <Provider store={store}>
        <TransactionFlowShell onRetry={jest.fn()} onCancel={jest.fn()} />
      </Provider>
    )
    expect(queryByTestId('MultiSwapProgressSheet')).toBeNull()
    expect(queryByTestId('PartialSuccessSheet')).toBeNull()
    expect(queryByTestId('TxFlowShell/Transitioning')).toBeNull()
    expect(toJSON()).toBeNull()
  })

  it('renders MultiSwapProgressSheet while a step is in flight', () => {
    const store = createMockStore({
      dollarsSpend: {
        inFlight: {
          plannedSteps: [stepUsat, stepUsdm],
          completedSteps: 0,
          failedAtIndex: null,
          lastError: null,
        },
        transitioning: false,
      },
    })
    const { queryByTestId } = render(
      <Provider store={store}>
        <TransactionFlowShell onRetry={jest.fn()} onCancel={jest.fn()} />
      </Provider>
    )
    expect(queryByTestId('MultiSwapProgressSheet')).not.toBeNull()
    expect(queryByTestId('PartialSuccessSheet')).toBeNull()
    expect(queryByTestId('TxFlowShell/Transitioning')).toBeNull()
  })

  it('renders the transitional message when transitioning is true (closes the blank-frame gap)', () => {
    // This is the regression: between multiSwapStepFailed and Redux propagating
    // the failure, BOTH sheets used to return null and the user saw a blank frame.
    // The shell now shows a transitional message in that window.
    const store = createMockStore({
      dollarsSpend: {
        inFlight: {
          plannedSteps: [stepUsat, stepUsdm],
          completedSteps: 1,
          failedAtIndex: 1,
          lastError: 'tx reverted',
        },
        transitioning: true,
      },
    })
    const { getByTestId, getByText, queryByTestId } = render(
      <Provider store={store}>
        <TransactionFlowShell onRetry={jest.fn()} onCancel={jest.fn()} />
      </Provider>
    )
    expect(getByTestId('TxFlowShell/Transitioning')).toBeTruthy()
    expect(getByText('dollarsSpend.transitioning')).toBeTruthy()
    expect(queryByTestId('MultiSwapProgressSheet')).toBeNull()
    expect(queryByTestId('PartialSuccessSheet')).toBeNull()
  })

  it('renders PartialSuccessSheet once the transition window closes', () => {
    const store = createMockStore({
      dollarsSpend: {
        inFlight: {
          plannedSteps: [stepUsat, stepUsdm],
          completedSteps: 1,
          failedAtIndex: 1,
          lastError: 'tx reverted',
        },
        transitioning: false,
      },
    })
    const { queryByTestId } = render(
      <Provider store={store}>
        <TransactionFlowShell onRetry={jest.fn()} onCancel={jest.fn()} />
      </Provider>
    )
    expect(queryByTestId('PartialSuccessSheet')).not.toBeNull()
    expect(queryByTestId('MultiSwapProgressSheet')).toBeNull()
    expect(queryByTestId('TxFlowShell/Transitioning')).toBeNull()
  })
})

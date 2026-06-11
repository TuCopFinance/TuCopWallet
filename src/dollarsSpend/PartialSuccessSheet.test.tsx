import * as React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import { Provider } from 'react-redux'
import PartialSuccessSheet from 'src/dollarsSpend/PartialSuccessSheet'
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

describe('PartialSuccessSheet', () => {
  it('renders nothing when no failure', () => {
    const store = createMockStore({ dollarsSpend: { inFlight: null } })
    const { queryByTestId } = render(
      <Provider store={store}>
        <PartialSuccessSheet onRetry={jest.fn()} onCancel={jest.fn()} />
      </Provider>
    )
    expect(queryByTestId('PartialSuccessSheet')).toBeNull()
  })

  it('renders progress + remaining when step 1 of 2 failed', () => {
    const store = createMockStore({
      dollarsSpend: {
        inFlight: {
          plannedSteps: [stepUsat, stepUsdm],
          completedSteps: 1,
          failedAtIndex: 1,
          lastError: 'tx reverted',
        },
      },
    })
    const { getByText } = render(
      <Provider store={store}>
        <PartialSuccessSheet onRetry={jest.fn()} onCancel={jest.fn()} />
      </Provider>
    )
    expect(getByText('dollarsSpend.partialSuccess.title, {"completed":1,"total":2}')).toBeTruthy()
    // remaining = stepUsdm.amountUsd ($50) since failedAtIndex=1
    expect(
      getByText('dollarsSpend.partialSuccess.remaining, {"remainingUsd":"$50.00"}')
    ).toBeTruthy()
  })

  it('fires onRetry when retry button pressed', () => {
    const onRetry = jest.fn()
    const store = createMockStore({
      dollarsSpend: {
        inFlight: {
          plannedSteps: [stepUsat, stepUsdm],
          completedSteps: 1,
          failedAtIndex: 1,
          lastError: 'tx reverted',
        },
      },
    })
    const { getByTestId } = render(
      <Provider store={store}>
        <PartialSuccessSheet onRetry={onRetry} onCancel={jest.fn()} />
      </Provider>
    )
    fireEvent.press(getByTestId('PartialSuccessSheet/Retry'))
    expect(onRetry).toHaveBeenCalled()
  })
})

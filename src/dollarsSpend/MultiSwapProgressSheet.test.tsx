import * as React from 'react'
import { render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import { Provider } from 'react-redux'
import MultiSwapProgressSheet from 'src/dollarsSpend/MultiSwapProgressSheet'
import { SpendStep } from 'src/dollarsSpend/types'
import { createMockStore } from 'test/utils'

const step: SpendStep = {
  tokenId: 'celo-mainnet:usat',
  symbol: 'USAT',
  amountUsd: new BigNumber(30),
  amountTokenWhole: new BigNumber(30),
}

describe('MultiSwapProgressSheet', () => {
  it('renders nothing when no in-flight session', () => {
    const store = createMockStore({ dollarsSpend: { inFlight: null } })
    const { queryByTestId } = render(
      <Provider store={store}>
        <MultiSwapProgressSheet />
      </Provider>
    )
    expect(queryByTestId('MultiSwapProgressSheet')).toBeNull()
  })

  it('renders "Paso 1 de 3" when first step is in flight', () => {
    const store = createMockStore({
      dollarsSpend: {
        inFlight: {
          plannedSteps: [step, step, step],
          completedSteps: 0,
          failedAtIndex: null,
          lastError: null,
        },
      },
    })
    const { getByText } = render(
      <Provider store={store}>
        <MultiSwapProgressSheet />
      </Provider>
    )
    expect(
      getByText('dollarsSpend.stepProgress, {"index":1,"total":3,"symbol":"USAT"}')
    ).toBeTruthy()
  })

  it('renders "Paso 2 de 3" after first step succeeds', () => {
    const store = createMockStore({
      dollarsSpend: {
        inFlight: {
          plannedSteps: [step, step, step],
          completedSteps: 1,
          failedAtIndex: null,
          lastError: null,
        },
      },
    })
    const { getByText } = render(
      <Provider store={store}>
        <MultiSwapProgressSheet />
      </Provider>
    )
    expect(
      getByText('dollarsSpend.stepProgress, {"index":2,"total":3,"symbol":"USAT"}')
    ).toBeTruthy()
  })

  it('renders nothing when a step has failed (PartialSuccessSheet takes over)', () => {
    const store = createMockStore({
      dollarsSpend: {
        inFlight: {
          plannedSteps: [step, step],
          completedSteps: 1,
          failedAtIndex: 1,
          lastError: 'tx reverted',
        },
      },
    })
    const { queryByTestId } = render(
      <Provider store={store}>
        <MultiSwapProgressSheet />
      </Provider>
    )
    expect(queryByTestId('MultiSwapProgressSheet')).toBeNull()
  })
})

import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import 'react-native'
import { Provider } from 'react-redux'
import WithdrawSpend from 'src/fiatExchanges/WithdrawSpend'
import { navigate } from 'src/navigator/NavigationService'
import { createMockStore } from 'test/utils'

describe('WithdrawSpend', () => {
  it('renders correctly', () => {
    const store = createMockStore({})
    const tree = render(
      <Provider store={store}>
        <WithdrawSpend />
      </Provider>
    )
    expect(tree.queryByTestId('cashOut')).toBeTruthy()
    expect(tree.queryByTestId('otherFundingOptions')).toBeTruthy()
  })

  it('cashOut navigates correctly', () => {
    const store = createMockStore({})
    const tree = render(
      <Provider store={store}>
        <WithdrawSpend />
      </Provider>
    )
    fireEvent.press(tree.getByTestId('cashOut'))
    expect(navigate).toHaveBeenCalledWith('FiatExchangeCurrencyBottomSheet', {
      flow: 'CashOut',
    })
  })
})

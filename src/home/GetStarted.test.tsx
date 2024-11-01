import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import GetStarted from 'src/home/GetStarted'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { createMockStore } from 'test/utils'
import { mockCkesTokenId, mockTokenBalances } from 'test/values'

describe('GetStarted', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should display the correct text', () => {
    const store = createMockStore({ tokens: { tokenBalances: mockTokenBalances } })
    const { getByText } = render(
      <Provider store={store}>
        <GetStarted />
      </Provider>
    )

    expect(getByText('getStartedActivity.title, {"tokenSymbol":"cKES"}')).toBeTruthy()
    expect(getByText('getStartedActivity.cta, {"tokenSymbol":"cKES"}')).toBeTruthy()
  })

  it('should trigger button tap analytics event', () => {
    const store = createMockStore({ tokens: { tokenBalances: mockTokenBalances } })
    const { getByTestId } = render(
      <Provider store={store}>
        <GetStarted />
      </Provider>
    )

    fireEvent.press(getByTestId('GetStarted/cta'))
    expect(AppAnalytics.track).toHaveBeenCalledWith(
      FiatExchangeEvents.cico_add_get_started_selected
    )
    expect(navigate).toHaveBeenCalledWith(Screens.FiatExchangeAmount, {
      flow: 'CashIn',
      tokenId: mockCkesTokenId,
      tokenSymbol: 'cKES',
    })
  })
})

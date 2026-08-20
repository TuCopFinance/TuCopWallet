import { render } from '@testing-library/react-native'
import * as React from 'react'
import { WebView } from 'react-native-webview'
import { Provider } from 'react-redux'
import BidaliScreen from 'src/fiatExchanges/BidaliScreen'
import { Screens } from 'src/navigator/Screens'
import { Currency } from 'src/utils/currencies'
import { createMockStore, getMockStackScreenProps } from 'test/utils'
import { mockCeurTokenId, mockCusdTokenId, mockTokenBalances } from 'test/values'

const mockScreenProps = getMockStackScreenProps(Screens.BidaliScreen, {
  currency: Currency.Dollar,
})

declare global {
  interface Window {
    walletApp: any
  }
}

describe(BidaliScreen, () => {
  beforeEach(() => {
    // Reset injected JS effect
    window.walletApp = undefined
  })

  it('renders correctly when no phone number is provided', () => {
    const mockStore = createMockStore({
      account: { e164PhoneNumber: null },
      tokens: {
        tokenBalances: {
          [mockCusdTokenId]: {
            ...mockTokenBalances[mockCusdTokenId],
            balance: '10',
          },
          [mockCeurTokenId]: {
            ...mockTokenBalances[mockCeurTokenId],
            balance: '5',
          },
        },
      },
    })

    const { UNSAFE_getByType } = render(
      <Provider store={mockStore}>
        <BidaliScreen {...mockScreenProps} />
      </Provider>
    )

    const webView = UNSAFE_getByType(WebView)
    expect(webView).toBeDefined()
    // eslint-disable-next-line no-eval
    expect(eval(webView.props.injectedJavaScriptBeforeContentLoaded)).toBe(true)
    expect(window.walletApp).toMatchInlineSnapshot(`
      {
        "balances": {
          "EURM": "5",
          "USDM": "10",
        },
        "onPaymentRequest": [Function],
        "openUrl": [Function],
        "paymentCurrency": "USDM",
        "phoneNumber": null,
      }
    `)
  })

  it('renders correctly when a phone number is provided', () => {
    const mockStore = createMockStore({
      account: { e164PhoneNumber: '+14155556666' },
      tokens: {
        tokenBalances: {
          [mockCusdTokenId]: {
            ...mockTokenBalances[mockCusdTokenId],
            balance: '10',
          },
          [mockCeurTokenId]: {
            ...mockTokenBalances[mockCeurTokenId],
            balance: '5',
          },
        },
      },
    })

    const { UNSAFE_getByType } = render(
      <Provider store={mockStore}>
        <BidaliScreen {...mockScreenProps} />
      </Provider>
    )
    const webView = UNSAFE_getByType(WebView)
    expect(webView).toBeDefined()
    // eslint-disable-next-line no-eval
    expect(eval(webView.props.injectedJavaScriptBeforeContentLoaded)).toBe(true)
    expect(window.walletApp).toMatchInlineSnapshot(`
      {
        "balances": {
          "EURM": "5",
          "USDM": "10",
        },
        "onPaymentRequest": [Function],
        "openUrl": [Function],
        "paymentCurrency": "USDM",
        "phoneNumber": "+14155556666",
      }
    `)
  })

  it('renders correctly when no currency is passed', () => {
    const mockStore = createMockStore({
      account: { e164PhoneNumber: '+14155556666' },
      tokens: {
        tokenBalances: {
          [mockCusdTokenId]: {
            ...mockTokenBalances[mockCusdTokenId],
            balance: '10',
          },
          [mockCeurTokenId]: {
            ...mockTokenBalances[mockCeurTokenId],
            balance: '9',
          },
        },
      },
    })

    const { UNSAFE_getByType } = render(
      <Provider store={mockStore}>
        <BidaliScreen
          {...getMockStackScreenProps(Screens.BidaliScreen, {
            currency: undefined,
          })}
        />
      </Provider>
    )
    const webView = UNSAFE_getByType(WebView)
    expect(webView).toBeDefined()
    // eslint-disable-next-line no-eval
    expect(eval(webView.props.injectedJavaScriptBeforeContentLoaded)).toBe(true)
    // `paymentCurrency` is EURM here because it has the highest balance in the local currency
    // (post Mento rebrand deploy 2026-08-20 the on-chain symbol is EURm, not cEUR)
    expect(window.walletApp).toMatchInlineSnapshot(`
      {
        "balances": {
          "EURM": "9",
          "USDM": "10",
        },
        "onPaymentRequest": [Function],
        "openUrl": [Function],
        "paymentCurrency": "EURM",
        "phoneNumber": "+14155556666",
      }
    `)
  })
})

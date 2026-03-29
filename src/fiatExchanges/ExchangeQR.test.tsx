import Clipboard from '@react-native-clipboard/clipboard'
import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import { FiatExchangeEvents } from 'src/analytics/Events'
import AppAnalytics from 'src/analytics/AppAnalytics'
import ExchangeQR from 'src/fiatExchanges/ExchangeQR'
import { ExternalExchangeProvider } from 'src/fiatExchanges/ExternalExchanges'
import { CICOFlow } from 'src/fiatExchanges/utils'
import { Screens } from 'src/navigator/Screens'
import { createMockStore, getMockStackScreenProps } from 'test/utils'

const mockStore = createMockStore({
  web3: {
    account: '0x0000',
  },
  account: {
    name: 'username',
  },
})

const exchanges: ExternalExchangeProvider[] = [
  {
    name: 'Coinbase Pro',
    link: 'https://example.com/0',
    currencies: [],
    supportedRegions: [],
  },
  {
    name: 'Bittrex',
    link: 'https://example.com/1',
    currencies: [],
    supportedRegions: [],
  },
  {
    name: 'KuCoin',
    link: 'https://example.com/2',
    currencies: [],
    supportedRegions: [],
  },
]

function getProps() {
  return getMockStackScreenProps(Screens.ExchangeQR, {
    flow: CICOFlow.CashIn,
    exchanges,
  })
}

describe('ExchangeQR', () => {
  beforeEach(() => {
    mockStore.dispatch = jest.fn()
  })

  it('copies address when copy button pressed', async () => {
    const { queryByTestId, getByTestId } = render(
      <Provider store={mockStore}>
        <ExchangeQR {...getProps()} />
      </Provider>
    )

    expect(queryByTestId('copyButton')).toBeTruthy()
    await fireEvent.press(getByTestId('copyButton'))
    expect(AppAnalytics.track).toHaveBeenCalledWith(
      FiatExchangeEvents.cico_exchange_qr_copy_address,
      {
        flow: CICOFlow.CashIn,
      }
    )
    expect(Clipboard.setString).toHaveBeenCalledWith('0x0000')
  })

  it('renders QRCode component with exchanges', async () => {
    const { queryByTestId } = render(
      <Provider store={mockStore}>
        <ExchangeQR {...getProps()} />
      </Provider>
    )

    // QRCode component should be rendered with exchange information
    expect(queryByTestId('QRCode')).toBeTruthy()
    expect(queryByTestId('copyButton')).toBeTruthy()
    expect(queryByTestId('address')).toBeTruthy()
  })
})

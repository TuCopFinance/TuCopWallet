import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import HeaderQuickActions from 'src/home/HeaderQuickActions'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { RootState } from 'src/redux/reducers'
import { NetworkId } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import { RecursivePartial, createMockStore } from 'test/utils'

// Tap-behavior tests for the 4 quick action icons rendered in the tab
// header. Previously these lived in TabHome.test.tsx when the quick
// actions were mounted as a bar under the balance card; they moved here
// after PR (this one) promoted the row into tabHeader.headerLeft.

jest.mock('src/tokens/hooks', () => {
  const nc = jest.requireActual('src/web3/networkConfig').default
  return {
    ...jest.requireActual('src/tokens/hooks'),
    useUSDT: () => ({
      tokenId: 'celo-mainnet:0xd077a400968890eacc75cdc901f0356c943e4fdb',
      symbol: 'USDT',
    }),
    useCOPm: () => ({
      tokenId: nc.copmTokenId,
      symbol: 'COPm',
    }),
  }
})

const copmTokenId = networkConfig.copmTokenId
const usdtTokenId = networkConfig.usdtTokenId

const mockBalances = {
  tokens: {
    tokenBalances: {
      [copmTokenId]: {
        name: 'COPm',
        networkId: NetworkId['celo-mainnet'],
        tokenId: copmTokenId,
        address: copmTokenId.split(':')[1],
        symbol: 'COPm',
        decimals: 18,
        balance: '100',
        priceUsd: '0.00025',
        priceFetchedAt: Date.now(),
      },
      [usdtTokenId]: {
        name: 'USDT',
        networkId: NetworkId['celo-mainnet'],
        tokenId: usdtTokenId,
        address: usdtTokenId.split(':')[1],
        symbol: 'USDT',
        decimals: 6,
        balance: '10',
        priceUsd: '1',
        priceFetchedAt: Date.now(),
      },
    },
  },
}

function renderComponent(storeOverrides: RecursivePartial<RootState> = {}) {
  const store = createMockStore({
    ...mockBalances,
    buckspay: { flowStatus: 'idle' },
    ...storeOverrides,
  })
  return render(
    <Provider store={store}>
      <HeaderQuickActions />
    </Provider>
  )
}

describe('HeaderQuickActions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Tapping send money opens the send flow', () => {
    const { getByTestId } = renderComponent()
    fireEvent.press(getByTestId('Header/SendMoney'))
    expect(navigate).toHaveBeenCalledWith('SendSelectRecipient', {
      defaultTokenIdOverride: copmTokenId,
    })
  })

  it('Tapping receive money opens the QR code screen', () => {
    const { getByTestId } = renderComponent()
    fireEvent.press(getByTestId('Header/ReceiveMoney'))
    expect(navigate).toHaveBeenCalledWith('QRNavigator', { screen: 'QRCode' })
  })

  it('Tapping add COPm (Recarga) navigates to the cash-in screen with USDT preselected', () => {
    const { getByTestId } = renderComponent()
    fireEvent.press(getByTestId('Header/AddCOPm'))
    expect(navigate).toHaveBeenCalledWith(Screens.FiatExchangeAmount, {
      tokenId: 'celo-mainnet:0xd077a400968890eacc75cdc901f0356c943e4fdb',
      flow: 'CashIn',
      tokenSymbol: 'USDT',
    })
  })

  it('Tapping spend money (Gasta) opens the offramp provider screen when idle', () => {
    const { getByTestId } = renderComponent()
    fireEvent.press(getByTestId('Header/SpendMoney'))
    expect(navigate).toHaveBeenCalledWith(Screens.SelectOfframpProvider)
  })

  it('Tapping spend money routes to BucksPayStatus when a bucks-pay flow is in flight', () => {
    const { getByTestId } = renderComponent({ buckspay: { flowStatus: 'tracking' } })
    fireEvent.press(getByTestId('Header/SpendMoney'))
    expect(navigate).toHaveBeenCalledWith(Screens.BucksPayStatus)
  })
})

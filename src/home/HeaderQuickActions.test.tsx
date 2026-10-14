import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import HeaderQuickActions from 'src/home/HeaderQuickActions'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { RootState } from 'src/redux/reducers'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { NetworkId } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import { RecursivePartial, createMockStore } from 'test/utils'

// Tap-behavior tests for the 4 quick action icons rendered in the tab
// header. Previously these lived in TabHome.test.tsx when the quick
// actions were mounted as a bar under the balance card; they moved here
// after PR (this one) promoted the row into tabHeader.headerLeft.

jest.mock('src/statsig')

function enableGates(gates: StatsigFeatureGates[]) {
  jest.mocked(getFeatureGate).mockImplementation((gate) => gates.includes(gate))
}

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
    enableGates([])
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

  it('Tapping add COPm (Recarga) keeps the cash-in flow with USDT when no deposit ramp is on', () => {
    const { getByTestId } = renderComponent()
    fireEvent.press(getByTestId('Header/AddCOPm'))
    expect(navigate).toHaveBeenCalledWith(Screens.FiatExchangeAmount, {
      tokenId: 'celo-mainnet:0xd077a400968890eacc75cdc901f0356c943e4fdb',
      flow: 'CashIn',
      tokenSymbol: 'USDT',
    })
  })

  it.each([StatsigFeatureGates.SHOW_TUCOPRAMP_ONRAMP, StatsigFeatureGates.SHOW_BRIDGERAMP_ONRAMP])(
    'Tapping add COPm (Recarga) opens the deposit ramp chooser when %s is on',
    (gate) => {
      enableGates([gate])
      const { getByTestId } = renderComponent()
      fireEvent.press(getByTestId('Header/AddCOPm'))
      expect(navigate).toHaveBeenCalledWith(Screens.SelectRampProvider, { direction: 'onramp' })
    }
  )

  it.each([
    StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP,
    StatsigFeatureGates.SHOW_BRIDGERAMP_OFFRAMP,
  ])('Tapping withdraw (Retira) opens the withdraw ramp chooser when %s is on', (gate) => {
    enableGates([gate])
    const { getByTestId } = renderComponent()
    fireEvent.press(getByTestId('Header/SpendMoney'))
    expect(navigate).toHaveBeenCalledWith(Screens.SelectRampProvider, { direction: 'offramp' })
  })

  it('Tapping withdraw (Retira) opens the legacy withdraw screen when no withdraw ramp is on', () => {
    const { getByTestId } = renderComponent()
    fireEvent.press(getByTestId('Header/SpendMoney'))
    expect(navigate).toHaveBeenCalledWith(Screens.WithdrawSpend)
    expect(navigate).not.toHaveBeenCalledWith(Screens.SelectRampProvider, expect.anything())
  })
})

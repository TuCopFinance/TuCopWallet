import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { FetchMock } from 'jest-fetch-mock/types'
import * as React from 'react'
import { Provider } from 'react-redux'
import { CICOFlow } from 'src/fiatExchanges/utils'
import TabHome from 'src/home/TabHome'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { RootState } from 'src/redux/reducers'
import { NetworkId } from 'src/transactions/types'
import MockedNavigator from 'test/MockedNavigator'
import { RecursivePartial, createMockStore } from 'test/utils'
import { mockCkesAddress, mockCkesTokenId, mockCusdAddress, mockCusdTokenId } from 'test/values'

jest.mock('src/web3/networkConfig', () => {
  const originalModule = jest.requireActual('src/web3/networkConfig')
  return {
    ...originalModule,
    __esModule: true,
    default: {
      ...originalModule.default,
      defaultNetworkId: 'celo-alfajores',
    },
  }
})

const mockBalances = {
  tokens: {
    tokenBalances: {
      [mockCusdTokenId]: {
        address: mockCusdAddress,
        tokenId: mockCusdTokenId,
        networkId: NetworkId['celo-alfajores'],
        symbol: 'cUSD',
        decimals: 18,
        balance: '1',
        isFeeCurrency: true,
        priceUsd: '1',
        priceFetchedAt: Date.now(),
        isCashInEligible: true,
        isCashOutEligible: true,
      },
      [mockCkesTokenId]: {
        name: 'cKES',
        networkId: NetworkId['celo-alfajores'],
        tokenId: mockCkesTokenId,
        address: mockCkesAddress,
        symbol: 'cKES',
        decimals: 18,
        imageUrl: 'https://example.com/address-metadata/main/assets/tokens/cKES.png',
        balance: '0',
        priceUsd: '1',
        priceFetchedAt: Date.now(),
        isCashInEligible: true,
        isCashOutEligible: true,
      },
    },
  },
}

jest.mock('src/fiatExchanges/utils', () => ({
  ...(jest.requireActual('src/fiatExchanges/utils') as any),
  fetchProviders: jest.fn(),
}))

describe('TabHome', () => {
  const mockFetch = fetch as FetchMock

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResponse(
      JSON.stringify({
        data: {
          tokenTransactionsV2: {
            transactions: [],
          },
        },
      })
    )
  })

  function renderScreen(storeOverrides: RecursivePartial<RootState> = {}, screenParams = {}) {
    const store = createMockStore({
      ...mockBalances,
      ...storeOverrides,
    })

    const tree = render(
      <Provider store={store}>
        <MockedNavigator component={TabHome} params={screenParams} />
      </Provider>
    )

    return {
      store,
      tree,
      ...tree,
    }
  }

  it('renders home tab correctly and fires initial actions', async () => {
    const { store } = renderScreen({
      app: {
        phoneNumberVerified: true,
      },
      recipients: {
        phoneRecipientCache: {},
      },
    })

    await waitFor(() =>
      expect(store.getActions().map((action) => action.type)).toEqual(
        expect.arrayContaining([
          'HOME/VISIT_HOME',
          'HOME/REFRESH_BALANCES',
          'IDENTITY/IMPORT_CONTACTS',
        ])
      )
    )
  })

  it("doesn't import contacts if number isn't verified", async () => {
    const { store } = renderScreen({
      app: {
        phoneNumberVerified: false,
      },
      recipients: {
        phoneRecipientCache: {},
      },
    })

    await waitFor(() =>
      expect(store.getActions().map((action) => action.type)).toEqual(
        expect.arrayContaining(['HOME/VISIT_HOME', 'HOME/REFRESH_BALANCES'])
      )
    )
  })

  it('Tapping add cKES opens the bottom sheet if the user has cUSD', async () => {
    const { getByTestId } = renderScreen()

    fireEvent.press(getByTestId('FlatCard/AddCKES'))
    expect(getByTestId('AddCKESBottomSheet')).toBeVisible()
  })
  it('Tapping add from cUSD on the bottom sheet opens the swap screen', async () => {
    const { getByTestId } = renderScreen()

    fireEvent.press(getByTestId('FlatCard/AddCKES'))
    fireEvent.press(getByTestId('FlatCard/AddFromCUSD'))
    expect(navigate).toHaveBeenCalledWith('SwapScreenWithBack', {
      fromTokenId: mockCusdTokenId,
      toTokenId: mockCkesTokenId,
    })
  })
  it('Tapping purchase cKES on the bottom sheet opens the cash in flow', async () => {
    const { getByTestId } = renderScreen()

    fireEvent.press(getByTestId('FlatCard/AddCKES'))
    fireEvent.press(getByTestId('FlatCard/PurchaseCKES'))
    expect(navigate).toHaveBeenCalledWith('FiatExchangeAmount', {
      tokenId: mockCkesTokenId,
      flow: 'CashIn',
      tokenSymbol: 'cKES',
    })
  })
  it('Tapping add cKES opens the cash in flow if the user does not have cUSD', async () => {
    const { getByTestId } = renderScreen({
      tokens: {
        tokenBalances: {
          ...mockBalances.tokens.tokenBalances,
          [mockCusdTokenId]: {
            ...mockBalances.tokens.tokenBalances[mockCusdTokenId],
            balance: '0',
          },
        },
      },
    })

    fireEvent.press(getByTestId('FlatCard/AddCKES'))
    expect(navigate).toHaveBeenCalledWith('FiatExchangeAmount', {
      tokenId: mockCkesTokenId,
      flow: 'CashIn',
      tokenSymbol: 'cKES',
    })
  })
  it('Tapping send money opens the send flow', async () => {
    const { getByTestId } = renderScreen()

    fireEvent.press(getByTestId('FlatCard/SendMoney'))
    expect(navigate).toHaveBeenCalledWith('SendSelectRecipient', {
      defaultTokenIdOverride: mockCkesTokenId,
    })
  })
  it('Tapping receive money opens the QR code screen', async () => {
    const { getByTestId } = renderScreen()

    fireEvent.press(getByTestId('FlatCard/ReceiveMoney'))
    expect(navigate).toHaveBeenCalledWith('QRNavigator', {
      screen: 'QRCode',
    })
  })
  it('Tapping hold USD opens the swap screen', async () => {
    const { getByTestId } = renderScreen()

    fireEvent.press(getByTestId('FlatCard/HoldUSD'))
    expect(navigate).toHaveBeenCalledWith('SwapScreenWithBack', {
      fromTokenId: mockCkesTokenId,
      toTokenId: mockCusdTokenId,
    })
  })
  it('Tapping withdraw opens the withdraw screen', async () => {
    const { getByTestId } = renderScreen()

    fireEvent.press(getByTestId('FlatCard/Withdraw'))
    expect(navigate).toHaveBeenCalledWith(Screens.FiatExchangeAmount, {
      flow: CICOFlow.CashOut,
      tokenId: mockCusdTokenId,
      tokenSymbol: 'cUSD',
    })
  })
})
